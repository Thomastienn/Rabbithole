import { cutProblem, planProblem } from './video-plan.mjs';
import { inks, trueColorsOk } from './video-colors.mjs';
import { readCall } from './reply-parser.mjs';
import { MAX_CLIP_SECONDS } from './clips.mjs';

const str = (description) => ({ type: 'string', description });
const tool = (name, description, properties, required = Object.keys(properties)) => ({
    name,
    description,
    parameters: { type: 'object', properties, required },
});
const MARK = {
    type: 'object',
    properties: {
        tool: { type: 'string', enum: ['cursor', 'sketch'] },
        sentence: { type: 'integer', description: '0-based sentence of the narration.' },
        x: { type: 'number', description: '2D cuts: frame pixels.' },
        y: { type: 'number', description: '2D cuts: frame pixels.' },
        target: str('3D cuts instead of x, y and points: the recurring object (set piece) marked.'),
        part: str('3D cuts, optional: a named part of the target, such as nozzle.'),
        label: str('Cursor only: optional short name, at most 40 characters.'),
        shape: { type: 'string', enum: ['circle', 'underline', 'arrow', 'freehand'] },
        points: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
    },
    required: ['tool', 'sentence'],
};
const START = tool('start_video', 'Start the plan with its title and description.', {
    title: str('Short title, at most 160 characters.'),
    description: str('One or two sentences, at most 280 characters.'),
});
const AREA = tool('add_area', 'Add one layout area of the frame.', {
    name: str('Area name.'),
    description: str('Its positions and purpose, with the spatial metaphor.'),
});
const COLOUR = tool(
    'add_colour',
    'Add one palette role: an ink, or a true colour name and hex for a real object.',
    {
        role: str('Role name, letters, digits and underscores, starting with a letter.'),
        ink: { type: 'string', enum: inks },
        name: str('True colour name, such as earthBlue; give with hex instead of ink.'),
        hex: str('Six-digit hex such as #2f6fb5, never pure white.'),
    },
    ['role'],
);
const OBJECT = tool(
    'add_object',
    'Add one recurring object; add its colour role first.',
    {
        name: str('Object name, used the same way in every cut.'),
        position: str('Where it lives in the frame.'),
        look: str('Shape, parts, proportions and size in frame pixels.'),
        colorRole: str('A role from add_colour; omit for an object drawn in neutrals.'),
        referenceQuery: str('Web image search words for one real photo of a real-world object.'),
    },
    ['name', 'position'],
);
// Offered only while the piece library has pieces: matching comes before the look is written.
const FIND = tool(
    'find_pieces',
    'Before add_object for an object with a look: up to 5 nearest saved pieces, each with its name and look.',
    {
        name: str('Object name, as add_object will give it.'),
        role: str('What the object is and does in this video, in a few words.'),
    },
);
const PIECED_OBJECT = {
    ...OBJECT,
    parameters: {
        ...OBJECT.parameters,
        properties: {
            ...OBJECT.parameters.properties,
            piece: str('The saved piece from find_pieces whose look it adopts, to start from.'),
        },
    },
};
export const PIECES_PLAN_NOTE =
    "\nSaved pieces: before add_object for a recurring object with a look, call find_pieces with its name and role; it returns up to 5 nearest pieces saved in the learner's piece library, each with its name and look. When a match is the same real object, adopt the saved piece's look and name it as piece in add_object, the piece to start from; describe a new look only for a different object or when the saved look cannot serve this video.";
const TERM = tool('add_term', 'Add one exact term every cut spells the same way.', {
    term: str('The exact term.'),
});
const CUT = tool(
    'add_cut',
    'Add the next cut, in playback order.',
    {
        purpose: str('One clear teaching step.'),
        narration: str('Plain spoken script.'),
        engine: { type: 'string', enum: ['remotion', 'manim'] },
        dimension: { type: 'string', enum: ['2d', '3d'] },
        camera: str('3D cuts only: how the camera moves and at what pace.'),
        join: { type: 'string', enum: ['scene', 'continue'] },
        transition: {
            type: 'string',
            enum: ['fade', 'slide', 'wipe', 'flip', 'clockWipe', 'iris'],
        },
        direction: str('slide, flip and wipe: from-left, from-right, from-top or from-bottom.'),
        endState: str('Objects, positions and labels at the end.'),
        emphasis: { type: 'array', items: MARK },
    },
    ['purpose', 'narration', 'engine', 'dimension', 'join', 'endState'],
);
const exhibitTool = (clips) =>
    tool(
        'add_exhibit',
        'Add one real web exhibit to a Remotion cut already added; at most two per cut.',
        {
            cut: { type: 'integer', description: '1-based cut number.' },
            kind: { type: 'string', enum: ['image', 'quote', ...(clips ? ['clip'] : [])] },
            query: str('Web search words, at most 200 characters.'),
            show: str('Image or clip: what it shows and why it helps.'),
            text: str('Quote: the short quote, at most 280 characters.'),
            by: str('Quote: who said or wrote it.'),
            ...(clips && {
                start: { type: 'number', description: 'Clip: seconds into the video.' },
                end: {
                    type: 'number',
                    description: `Clip: end seconds, at most ${MAX_CLIP_SECONDS} after start.`,
                },
                sound: { type: 'boolean' },
                sentence: {
                    type: 'integer',
                    description: 'Clip with sound: the sentence it plays after.',
                },
            }),
        },
        ['cut', 'kind', 'query'],
    );
const FINISH = tool('finish_video', 'Finish the plan once every cut is added.', {});

const CUT_FIELDS = [
    'purpose',
    'narration',
    'engine',
    'dimension',
    'camera',
    'join',
    'transition',
    'direction',
    'endState',
    'emphasis',
];
const OBJECT_FIELDS = ['name', 'position', 'colorRole', 'look', 'referenceQuery', 'piece'];
const pick = (input, fields) =>
    Object.fromEntries(Object.entries(input).filter(([k, v]) => fields.includes(k) && v != null));
const FIX = {
    purpose: 'purpose must be one clear teaching step.',
    narration: 'narration must be the plain spoken script.',
    engine: 'engine must be "remotion" or "manim".',
    dimension: 'dimension must be "2d" or "3d".',
    endState: 'endState must describe the objects, positions and labels at the end.',
    emphasis:
        'emphasis must be at most 12 cursor or sketch marks, each with a 0-based sentence and points inside the 1920x1080 frame.',
    emphasis3d:
        'emphasis in a 3D cut must be at most 12 cursor or sketch marks, each with a 0-based sentence and a target naming the set piece it marks (optionally a part), not x, y or points; sketch shapes are circle, underline or arrow.',
};
const text = (v) => typeof v === 'string' && !!v.trim();
const fail = (message) => {
    throw new Error(message);
};
// A structural problem in the words a learner and a model both read.
const said = (problem) =>
    problem === 'cuts'
        ? 'no cuts'
        : ['title', 'description'].includes(problem)
          ? `no valid ${problem} (call start_video)`
          : problem.replace(/^cut (\d+) (\w+)$/, 'cut $1 has no valid $2');

export const PLAN_TEXT_TOOLS =
    '\nYou cannot call tools natively. Write each call as <tool_call>{"name": "<tool>", "arguments": {...}}</tool_call>, in order; no result comes back, so check each call against its rules before writing it. Tools: ';

// One plan built from the smart model's calls into today's plan shape; each call is checked as it arrives.
// pieces: an async (text) => [{id, name, look}] of the nearest saved pieces, given only while the library has pieces.
export function planBuilder({ exhibits = false, clips = false, pieces = null } = {}) {
    const plan = {
        title: undefined,
        description: undefined,
        styleBrief: { layoutAreas: [], paletteRoles: {}, recurringObjects: [], exactTerms: [] },
        cuts: [],
    };
    const brief = plan.styleBrief,
        rejected = [];
    // Each object's offered pieces, by object name; text calls get no results back, so no matching.
    const found = new Map();
    let finished = false,
        accepted = 0,
        texting = false;
    const tools = [
        START,
        AREA,
        COLOUR,
        ...(pieces ? [FIND, PIECED_OBJECT] : [OBJECT]),
        TERM,
        CUT,
        ...(exhibits ? [exhibitTool(clips)] : []),
        FINISH,
    ];
    const assembled = () => {
        const { trueColors, ...rest } = brief;
        return { ...plan, styleBrief: trueColors && Object.keys(trueColors).length ? brief : rest };
    };
    const calls = {
        start_video(input) {
            if (!text(input.title) || input.title.length > 160)
                fail('title must be a short title, at most 160 characters.');
            if (!text(input.description) || input.description.length > 280)
                fail('description must be one or two sentences, at most 280 characters.');
            plan.title = input.title;
            plan.description = input.description;
            return 'Video started.';
        },
        add_area(input) {
            if (!text(input.name)) fail('name must name the area.');
            if (!text(input.description)) fail('description must give its positions and purpose.');
            brief.layoutAreas.push({ name: input.name, description: input.description });
            return 'Area added.';
        },
        add_colour({ role, ink, name, hex }) {
            if (typeof role !== 'string' || !/^[A-Za-z]\w*$/.test(role))
                fail('role must be letters, digits and underscores, starting with a letter.');
            if (ink !== undefined) {
                if (!inks.includes(ink)) fail(`ink must be one of ${inks.join(', ')}.`);
                brief.paletteRoles[role] = ink;
                return 'Colour added.';
            }
            if (typeof name !== 'string' || !trueColorsOk({ [name]: '#000000' }))
                fail(
                    'name must be a true colour name such as earthBlue that is not a kit colour, or give ink instead.',
                );
            if (!trueColorsOk({ [name]: hex }))
                fail('hex must be a six-digit hex such as #2f6fb5, never pure white.');
            brief.trueColors = { ...brief.trueColors, [name]: hex };
            brief.paletteRoles[role] = name;
            return 'Colour added.';
        },
        async find_pieces({ name, role }) {
            if (!text(name)) fail('name must name the object.');
            if (!text(role)) fail('role must say what the object is and does in this video.');
            const matches = await pieces(`${name}: ${role}`);
            found.set(name, matches);
            return matches.length
                ? JSON.stringify(matches.map((p) => ({ name: p.name, look: p.look })))
                : 'No saved pieces match.';
        },
        add_object(input) {
            if (!text(input.name)) fail('name must name the object.');
            if (pieces && !texting && input.look != null && !found.has(input.name))
                fail('call find_pieces with its name and role before giving it a look.');
            if (input.piece != null && !found.get(input.name)?.some((p) => p.name === input.piece))
                fail('piece must name a saved piece find_pieces returned for this object.');
            if (!text(input.position)) fail('position must say where it lives in the frame.');
            if (input.look != null && !text(input.look))
                fail('look must describe its shape, parts and size.');
            if (input.colorRole != null && !Object.hasOwn(brief.paletteRoles, input.colorRole))
                fail('colorRole must be a role already added with add_colour, or omitted.');
            if (
                input.referenceQuery != null &&
                (!text(input.referenceQuery) || input.referenceQuery.length > 200)
            )
                fail('referenceQuery must be search words, at most 200 characters.');
            // The adopted piece's library id, so the piece writer gets that exact piece's source.
            const chosen = found.get(input.name)?.find((p) => p.name === input.piece);
            brief.recurringObjects.push({
                ...pick(input, OBJECT_FIELDS),
                ...(chosen && { pieceId: chosen.id }),
            });
            return 'Object added.';
        },
        add_term(input) {
            if (!text(input.term)) fail('term must be the exact term.');
            brief.exactTerms.push(input.term);
            return 'Term added.';
        },
        add_cut(input) {
            const i = plan.cuts.length,
                cut = pick(input, CUT_FIELDS);
            // Cosmetic defaults: a Manim cut is flat, and an unreadable join is a scene change with the fade.
            if (cut.engine === 'manim' && cut.dimension === '3d') cut.dimension = '2d';
            if (cutProblem(cut, i) === 'join') {
                cut.join = 'scene';
                delete cut.transition;
                delete cut.direction;
            }
            const field = cutProblem(cut, i);
            if (field)
                fail(FIX[field === 'emphasis' && cut.dimension === '3d' ? 'emphasis3d' : field]);
            plan.cuts.push(cut);
            return `Cut ${i + 1} added.`;
        },
        add_exhibit({ cut: n, ...exhibit }) {
            const cut = plan.cuts[n - 1];
            if (!Number.isInteger(n) || !cut)
                fail(`cut must be the number of a cut already added (1 to ${plan.cuts.length}).`);
            if (cut.engine !== 'remotion')
                fail('cut must be a Remotion cut; Manim cuts have no exhibits.');
            const tried = { ...cut, exhibits: [...(cut.exhibits ?? []), exhibit] };
            if (tried.exhibits.length > 2) fail('A cut has at most two exhibits.');
            if (tried.exhibits.filter((e) => e.sound).length > 1)
                fail('A cut has at most one clip with sound.');
            if (cutProblem(tried, n - 1, exhibits, clips))
                fail(
                    `The ${exhibit.kind ?? 'exhibit'} is missing a field or breaks its limits; check query, show, text, by${clips ? ', start, end, sound and sentence' : ''}.`,
                );
            plan.cuts[n - 1] = tried;
            return 'Exhibit added.';
        },
        finish_video() {
            const problem = planProblem(assembled(), exhibits, clips);
            if (problem)
                fail(
                    `The plan has ${said(problem)}; add what is missing, then call finish_video again.`,
                );
            finished = true;
            return 'Video plan finished.';
        },
    };
    const run = (name, input) => {
        if (!tools.some((t) => t.name === name) || !input || typeof input !== 'object')
            fail(`Use ${tools.map((t) => t.name).join(', ')}.`);
        const result = calls[name](input);
        accepted++;
        return result;
    };
    return {
        tools,
        run,
        textTools:
            PLAN_TEXT_TOOLS +
            JSON.stringify(
                tools.filter((t) => t !== FIND).map((t) => (t === PIECED_OBJECT ? OBJECT : t)),
            ) +
            (pieces ? '\nfind_pieces is unavailable here: write each look as usual.' : ''),
        // Text-mode (or leaked) calls in the answer, run in order; a rejected one is kept for the retry note.
        read(raw) {
            texting = true;
            for (const [, json] of raw.matchAll(/<tool_call>([\s\S]*?)(?:<\/tool_call>|$)/g)) {
                const call = readCall({ json });
                try {
                    if (call?.name === 'find_pieces') fail('find_pieces is unavailable here.');
                    if (call) run(call.name, call.input);
                } catch (e) {
                    rejected.push(`${call.name}: ${e.message}`);
                }
            }
        },
        // Null once finish_video accepted the plan, else the problem in words.
        problem() {
            if (finished) return null;
            if (!accepted && !rejected.length) return 'no plan calls were made';
            const structural = planProblem(assembled(), exhibits, clips);
            return (
                (structural
                    ? `the plan has ${said(structural)}`
                    : 'finish_video was never called') +
                (rejected.length ? `; rejected calls: ${rejected.slice(0, 3).join(' ')}` : '')
            );
        },
        plan: assembled,
    };
}
