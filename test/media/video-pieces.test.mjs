import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import {
    planFor,
    composition,
    manimCut,
    directive,
    complete,
    until,
    open,
    fakeRender,
    fixerTask,
    repairAnswer,
    planText,
    planThrough,
    patchOf,
} from '../support/video-kit.mjs';
import { writeSetPieces } from '../../server/media/video-pieces.mjs';
import { PIECES_PATCH_NOTE } from '../../server/media/video-cut.mjs';
import { cutSource, pieceNames, libraryPieces } from '../../server/media/video-plan.mjs';
import {
    REMOTION_SKILL,
    MANIM_SKILL,
    MOTION_DESIGN_SKILL,
    HOUSE_STYLE_SKILL,
    FOCAL_OBJECT_SKILL,
} from '../../server/media/skills.mjs';

const look = 'A rounded box 240x120 px with a crown on top, one third of its height.';
const pieces = `import { colors, palette } from './kit';
export function Winner({ x, y, scale = 1, highlight = false }) {
  return <div style={{ position: 'absolute', left: x - 120 * scale, top: y - 60 * scale, width: 240 * scale, height: 120 * scale, borderRadius: 16, background: highlight ? colors.winner : palette.raised, color: palette.paper }}>Winner</div>;
}`;
const usesPieces = composition
    .replace('import { AbsoluteFill', "import { Winner } from './pieces';\nimport { AbsoluteFill")
    .replace('A + B → Final', '<Winner x={960} y={400} highlight />');
const videoPlanWithLooks = () => {
    const plan = planFor(composition, 3);
    plan.styleBrief = {
        ...plan.styleBrief,
        recurringObjects: [{ ...plan.styleBrief.recurringObjects[0], look }],
    };
    plan.cuts[2].engine = 'manim';
    return plan;
};
const manim = {
    detect: () => ({ ready: true, python: 'fake-python' }),
    render: fakeRender,
};

test('plan looks are validated; set-piece modules must export every named piece and keep kit colors', () => {
    const plan = videoPlanWithLooks();
    assert.deepEqual(planThrough(plan), plan);
    assert.deepEqual(pieceNames(plan), ['Winner']);
    assert.deepEqual(
        pieceNames({
            ...plan,
            styleBrief: { ...plan.styleBrief, recurringObjects: [{ name: '2 red routers', look }] },
        }),
        ['Piece2RedRouters'],
    );
    assert.deepEqual(
        pieceNames({ ...plan, cuts: [{ ...plan.cuts[2] }] }),
        ['Winner'],
        'names come from looks whatever the engines',
    );
    assert.deepEqual(
        pieceNames(planFor()),
        [],
        'plans without looks (and older saved plans) get none',
    );
    const bad = structuredClone(plan);
    bad.styleBrief.recurringObjects[0].look = ' ';
    assert.throws(() => planThrough(bad), /^Error: look /);
    assert.equal(cutSource(pieces, plan.styleBrief, ['Winner']), pieces);
    assert.throws(
        () => cutSource(pieces, plan.styleBrief, ['Winner', 'Final']),
        /^Error: missing export Final\.$/,
    );
    assert.throws(
        () => cutSource(pieces.replace('palette.raised', "'white'"), plan.styleBrief, ['Winner']),
        /background/,
    );
    assert.throws(
        () =>
            cutSource(`import { Winner } from './pieces';\n` + pieces, plan.styleBrief, ['Winner']),
        /disallowed import/,
    );
    assert.equal(cutSource(usesPieces, plan.styleBrief), usesPieces, 'cuts may import ./pieces');
});

test('one set-piece call runs before any cut; Remotion cuts get the module staged and in their input, Manim cuts get looks; phase and usage stage pieces', async (t) => {
    const plan = videoPlanWithLooks();
    const calls = [],
        inputs = {},
        logs = [];
    let phaseAtPieces, livePieces, chat;
    const env = await open(
        {
            generate: async (tree, text, emit) => {
                if (tree.id) return complete(emit, 'Watch.' + directive);
                if (tree.stage === 'plan') {
                    calls.push('plan');
                    return complete(emit, planText(plan));
                }
                const input = fixerTask(text);
                if (tree.stage === 'pieces') {
                    calls.push('pieces');
                    inputs.pieces = input;
                    inputs.piecesInstructions = tree.instructions;
                    const row = env.store.tree(chat.id).artifacts[0];
                    phaseAtPieces = (
                        await (await env.get(`/api/trees/${chat.id}/artifacts/${row.id}`)).json()
                    ).phase;
                    return complete(emit, '```tsx\n' + pieces + '\n```');
                }
                const i = plan.cuts.findIndex((c) => c.purpose === input.cut.purpose);
                calls.push(`cut ${i}`);
                inputs[i] = input;
                input.instructions = tree.instructions;
                if (i === 0) {
                    const row = env.store.tree(chat.id).artifacts[0];
                    livePieces = (
                        await (
                            await env.get(`/api/trees/${chat.id}/artifacts/${row.id}/cuts`)
                        ).json()
                    ).pieces;
                }
                complete(emit, plan.cuts[i].engine === 'manim' ? manimCut : usesPieces);
            },
        },
        {
            log: (line) => logs.push(line),
            videoManim: manim,
        },
    );
    t.after(async () => {
        await env.app.stop();
        env.store.close();
    });
    chat = env.store.create('Pieces', 'codex');
    await (await env.post(`/api/trees/${chat.id}/messages`, { text: 'Make a video.' })).text();
    const row = await until(() =>
        env.store.tree(chat.id).artifacts.find((a) => ['ready', 'failed'].includes(a.status)),
    );
    assert.equal(row.status, 'ready', row.error);
    assert.deepEqual(calls.slice(0, 2), ['plan', 'pieces']);
    assert.equal(calls.filter((c) => c === 'pieces').length, 1);
    assert.deepEqual(calls.slice(2).sort(), ['cut 0', 'cut 1', 'cut 2']);
    assert.deepEqual(inputs.pieces.names, ['Winner']);
    assert.ok(!('library' in inputs.pieces), 'without an embedder the step gets no matches');
    assert.equal(inputs.pieces.styleBrief.recurringObjects[0].look, look);
    assert.equal(phaseAtPieces, 'pieces');
    assert.match(livePieces, /function Winner/, 'live player receives compiled set pieces');
    // The saved Remotion cuts keep the staged module their export renders with.
    const staged = (i) => {
        const file = join(env.dir, 'video-work', row.id, row.attempt, `cut-${i}`, 'pieces.tsx');
        return existsSync(file) ? readFileSync(file, 'utf8') : null;
    };
    assert.deepEqual([0, 1, 2].map(staged), [pieces, pieces, null]);
    for (const i of [0, 1]) assert.equal(inputs[i].setPieces, pieces);
    assert.ok(!('setPieces' in inputs[2]));
    // Each writer gets its engine's skill and no other.
    assert.ok(inputs.piecesInstructions.includes(REMOTION_SKILL));
    for (const i of [0, 1]) {
        assert.ok(inputs[i].instructions.includes(REMOTION_SKILL));
        assert.ok(!inputs[i].instructions.includes(MANIM_SKILL));
        assert.ok(inputs[i].instructions.includes(MOTION_DESIGN_SKILL));
    }
    assert.ok(inputs[2].instructions.includes(MANIM_SKILL));
    assert.ok(!inputs[2].instructions.includes(MOTION_DESIGN_SKILL));
    assert.ok(!inputs[2].instructions.includes(REMOTION_SKILL));
    // The set-piece and Remotion writers draw in the house style; only Remotion cuts get the focal rule.
    assert.ok(inputs.piecesInstructions.includes(HOUSE_STYLE_SKILL));
    for (const i of [0, 1])
        assert.ok(
            inputs[i].instructions.includes(HOUSE_STYLE_SKILL) &&
                inputs[i].instructions.includes(FOCAL_OBJECT_SKILL),
        );
    assert.ok(
        !inputs[2].instructions.includes(HOUSE_STYLE_SKILL) &&
            !inputs[2].instructions.includes(FOCAL_OBJECT_SKILL),
    );
    assert.equal(
        inputs[2].styleBrief.recurringObjects[0].look,
        look,
        'Manim cut input carries looks',
    );
    assert.equal(JSON.parse(row.source).pieces, pieces);
    assert.equal(
        logs.filter((l) => l.includes(' model finished ') && l.includes('stage="pieces"')).length,
        1,
    );
    assert.equal(env.store.usageEvents().events.filter((e) => e.task === 'video').length, 5);
    const saved = env.store.db.prepare('SELECT id FROM pieces').all();
    assert.equal(saved.length, 1, 'without an embedder the piece is still saved');
    const piece = env.store.piece(saved[0].id);
    assert.equal(piece.embedding, null);
    assert.deepEqual(
        [piece.name, piece.look, piece.roles, piece.videos],
        ['Winner', look, ['winner'], [row.id]],
    );
    assert.deepEqual(piece.props, ['x', 'y', 'scale', 'highlight', 'state']);
    assert.equal(piece.source, pieces);
});

test('a new video embeds each accepted set piece look and saves it to the piece library', async (t) => {
    const plan = videoPlanWithLooks();
    plan.cuts.pop();
    const embedded = [];
    const env = await open(
        {
            generate: async (tree, text, emit) => {
                if (tree.id) return complete(emit, 'Watch.' + directive);
                if (tree.stage === 'plan') return complete(emit, planText(plan));
                if (tree.stage === 'pieces') return complete(emit, pieces);
                complete(emit, usesPieces);
            },
        },
        {
            videoEmbed: async (texts) => {
                embedded.push(...texts);
                return texts.map(() => [0.6, 0.8]);
            },
        },
    );
    t.after(async () => {
        await env.app.stop();
        env.store.close();
    });
    const chat = env.store.create('Library', 'codex');
    await (await env.post(`/api/trees/${chat.id}/messages`, { text: 'Make a video.' })).text();
    const row = await until(() =>
        env.store.tree(chat.id).artifacts.find((a) => ['ready', 'failed'].includes(a.status)),
    );
    assert.equal(row.status, 'ready', row.error);
    // The chat's messages are embedded too, in the background.
    assert.deepEqual(
        embedded.filter((text) => text === look),
        [look],
    );
    const [match] = env.store.nearestPieces([0.6, 0.8]);
    assert.equal(match.name, 'Winner');
    assert.deepEqual(match.videos, [row.id]);
    assert.ok(Math.abs(match.embedding[0] - 0.6) < 1e-6 && Math.abs(match.score - 1) < 1e-6);
});

test('library pieces split per export with shared helpers; set pieces colour only through roles', () => {
    const brief = {
        paletteRoles: { winner: 'amber', loser: 'rust' },
        recurringObjects: [
            { name: 'winner', look: 'crowned box' },
            { name: 'note', position: 'left' },
            { name: 'loser', look: 'grey box' },
        ],
    };
    const module = `import { colors, palette } from './kit';
const box = 240;
export function Winner({ x, y, glow }) {
  return <div style={{ left: x, top: y, width: box, background: colors.winner }} />;
}
export const Loser = (props) => <div style={{ color: palette.paper }}><Winner x={props.x} y={props.y} /></div>;`;
    const [winner, loser] = libraryPieces(module, brief, ['Winner', 'Loser']);
    assert.deepEqual(
        [winner.name, winner.look, winner.roles],
        ['Winner', 'crowned box', ['winner']],
    );
    assert.ok(winner.props.includes('glow') && winner.props.includes('state'));
    assert.match(
        winner.source,
        /^import \{ colors, palette \} from '\.\/kit';\nconst box = 240;\nexport function Winner/,
    );
    assert.doesNotMatch(winner.source, /Loser/);
    assert.doesNotMatch(loser.source, /function Winner/, 'a piece refers to the pieces it draws');
    assert.deepEqual([winner.parts, loser.parts], [[], ['Winner']]);
    assert.deepEqual(loser.roles, []);
    const strict = { ...brief, recurringObjects: [brief.recurringObjects[0]] };
    const piece = (style) =>
        `import { colors, palette${style.includes('series') ? ', series' : ''} } from './kit';\nexport function Winner() { return <div style={{ ${style} }} />; }`;
    assert.throws(() => cutSource(piece("color: '#dfae4e'"), strict, ['Winner']), /#dfae4e/);
    assert.throws(
        () => cutSource(piece('color: palette.amber'), strict, ['Winner']),
        /palette\.amber/,
    );
    assert.throws(() => cutSource(piece('color: series[0]'), strict, ['Winner']), /series/);
    assert.ok(
        cutSource(piece('color: colors.winner, background: palette.raised'), strict, ['Winner']),
    );
    assert.ok(
        cutSource(
            `import { palette } from './kit';\nexport default () => <div style={{ color: palette.amber }} />;`,
            strict,
        ),
        'cuts keep hue access',
    );
});

test('set pieces get three tries and fail by name; Retry keeps the plan, then keeps set pieces that succeeded', async (t) => {
    const plan = videoPlanWithLooks();
    plan.cuts.pop();
    let plans = 0,
        pieceCalls = 0,
        piecesOk = false,
        cutOk = false;
    const cutCalls = [0, 0],
        errors = [];
    const env = await open({
        generate: async (tree, text, emit) => {
            if (tree.id) return complete(emit, 'Watch.' + directive);
            if (tree.stage === 'plan') {
                plans++;
                return complete(emit, planText(plan));
            }
            const input = fixerTask(text);
            if (tree.stage === 'pieces') {
                pieceCalls++;
                errors.push(input.validationError);
                const module = piecesOk
                    ? pieces
                    : pieces.replace('function Winner', 'function Champ');
                return complete(
                    emit,
                    input.failedCode === undefined
                        ? module
                        : patchOf(
                              input.failedCode,
                              module === input.failedCode ? module + '\n' : module,
                          ),
                );
            }
            const i = plan.cuts.findIndex((c) => c.purpose === input.cut.purpose);
            cutCalls[i]++;
            complete(
                emit,
                repairAnswer(
                    tree,
                    text,
                    i === 1 && !cutOk
                        ? usesPieces.replace('fontSize: 40', "fontSize: 40, color: 'blue'")
                        : usesPieces,
                ),
            );
        },
    });
    t.after(async () => {
        await env.app.stop();
        env.store.close();
    });
    const chat = env.store.create('Retry pieces', 'codex');
    await (await env.post(`/api/trees/${chat.id}/messages`, { text: 'Make a video.' })).text();
    const failed = await until(() =>
        env.store.tree(chat.id).artifacts.find((a) => a.status === 'failed'),
    );
    assert.equal(failed.error, 'Set pieces: missing export Winner. Retry keeps the plan.');
    assert.equal(pieceCalls, 3);
    assert.deepEqual(
        errors,
        [undefined, 'missing export Winner.', 'missing export Winner.'],
        'the repair sees the error',
    );
    assert.deepEqual(cutCalls, [0, 0]);
    await env.app.settled();

    piecesOk = true;
    await env.post(`/api/trees/${chat.id}/artifacts/${failed.id}/retry`);
    const cutFailed = await until(() => {
        const r = env.store.artifact(chat.id, failed.id);
        return r.status === 'failed' && r.attempt !== failed.attempt && r;
    });
    assert.match(cutFailed.error, /^Cut 2 of 2: /);
    assert.equal(plans, 1, 'Retry keeps the plan');
    assert.equal(pieceCalls, 4);
    await env.app.settled();

    cutOk = true;
    await env.post(`/api/trees/${chat.id}/artifacts/${failed.id}/retry`);
    const ready = await until(() => {
        const r = env.store.artifact(chat.id, failed.id);
        return r.status === 'ready' && r;
    });
    assert.equal(plans, 1);
    assert.equal(pieceCalls, 4, 'Retry keeps set pieces that succeeded');
    assert.deepEqual(cutCalls, [1, 4]);
    assert.equal(JSON.parse(ready.source).pieces, pieces);
});

test('set pieces count as drawn once a later export follows them; their 3D form counts with them', async () => {
    const { piecesDrawn } = await import('../../server/media/video-pieces.mjs');
    const names = ['Winner', 'Track'];
    assert.deepEqual(piecesDrawn('', names), { drawing: names, drawn: 0, total: 2 });
    assert.deepEqual(piecesDrawn('export function Winner() {\nexport const Wheel = 1;', names), {
        drawing: ['Track'],
        drawn: 1,
        total: 2,
    });
    assert.equal(
        piecesDrawn(
            'export function Winner() {}\nexport function Track() {}\nexport const Winner3D',
            names,
        ).drawn,
        2,
    );
});

test('a set-piece module that fails its check is fixed by a patch, and rewritten whole only when the patch does not apply', async () => {
    const plan = videoPlanWithLooks(),
        broken = pieces.replace('function Winner', 'function Champ');
    const write = (answers) => {
        const calls = [];
        return {
            calls,
            write: async (instructions, text) => {
                const task = fixerTask(text);
                calls.push({ instructions, task });
                return answers[calls.length - 1](task);
            },
        };
    };
    const run = ({ write }) =>
        writeSetPieces({
            plan,
            names: ['Winner'],
            write,
            matches: async () => [],
            signal: new AbortController().signal,
        });

    const patching = write([() => broken, (task) => patchOf(task.failedCode, pieces)]);
    assert.match((await run(patching)).source, /function Winner/);
    assert.equal(patching.calls.length, 2);
    assert.ok(patching.calls[1].instructions.endsWith(PIECES_PATCH_NOTE));
    assert.equal(patching.calls[1].task.failedCode, broken);
    assert.equal(patching.calls[1].task.validationError, 'missing export Winner.');

    const whole = write([() => broken, () => 'not a diff', () => pieces]);
    assert.match((await run(whole)).source, /function Winner/);
    assert.equal(whole.calls.length, 3);
    assert.ok(!whole.calls[2].instructions.endsWith(PIECES_PATCH_NOTE));
    assert.equal(whole.calls[2].task.failedCode, undefined);
    assert.equal(whole.calls[2].task.validationError, 'missing export Winner.');
});

test('a wrong piece choice is rewritten whole, since a code patch keeps the choices', async () => {
    const plan = planFor(composition, 1);
    const saved = {
        id: 'w',
        name: 'Winner',
        look: 'crowned box',
        props: ['x', 'y'],
        roles: [],
        source: pieces,
    };
    const inputs = [];
    const answers = [
        {
            pieces: [{ name: 'Winner', use: 'reuse', reason: 'fits', id: 'gone' }],
            code: 'const unused = 1;',
        },
        { pieces: [{ name: 'Winner', use: 'reuse', reason: 'fits', id: 'w' }], code: '' },
    ];
    const { choices } = await writeSetPieces({
        plan,
        names: ['Winner'],
        matches: async () => [[saved]],
        signal: new AbortController().signal,
        write: async (_rules, text) => {
            inputs.push(fixerTask(text));
            return JSON.stringify(answers[inputs.length - 1]);
        },
    });
    assert.equal(inputs.length, 2);
    assert.match(inputs[1].validationError, /names a piece that was not offered/);
    assert.equal(inputs[1].failedCode, undefined);
    assert.equal(choices[0].use, 'reuse');
});
