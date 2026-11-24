import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import {
    planFor,
    composition,
    directive,
    complete,
    until,
    open,
    planText,
    fixerTask,
    patchOf,
} from '../support/video-kit.mjs';
import { pieceChoices, assemblePieces, libraryPieces } from '../../server/media/video-plan.mjs';
import { writeSetPieces } from '../../server/media/video-pieces.mjs';

const pieces = `import { colors, palette } from './kit';
export function Winner({ x, y, scale = 1, highlight = false }) {
  return <div style={{ position: 'absolute', left: x - 120 * scale, top: y - 60 * scale, width: 240 * scale, height: 120 * scale, borderRadius: 16, background: highlight ? colors.winner : palette.raised, color: palette.paper }}>Winner</div>;
}`;

test('the set-piece step reuses, improves or draws new pieces from library matches with a reason; reuse takes the new roles; old pieces are backfilled', async (t) => {
    const looks = { champ: 'crowned box', loser: 'slim grey bar', note: 'folded note card' };
    const plan = planFor(composition, 1);
    plan.styleBrief = {
        ...plan.styleBrief,
        paletteRoles: { champ: 'leaf', loser: 'rust', note: 'lichen' },
        recurringObjects: Object.entries(looks).map(([name, look]) => ({
            name,
            position: 'centre',
            colorRole: name,
            look,
        })),
    };
    const vectors = {
        [looks.champ]: [1, 0],
        [looks.loser]: [0, 1],
        [looks.note]: [0.7, 0.7],
        'ghost look': [-1, 0],
    };
    const written = `import { colors } from './kit';
export function Loser({ x, y }) { return <div style={{ left: x, top: y, background: colors.loser }} />; }
export function Note({ x, y }) { return <div style={{ left: x, top: y, background: colors.note }} />; }`;
    let input;
    const logs = [];
    const env = await open(
        {
            generate: async (tree, text, emit) => {
                if (tree.id) return complete(emit, 'Watch.' + directive);
                if (tree.stage === 'plan') return complete(emit, planText(plan));
                if (tree.stage === 'pieces') {
                    input = JSON.parse(text);
                    const id = (n) =>
                        input.library.flatMap((l) => l.matches).find((m) => m.name === n).id;
                    return complete(
                        emit,
                        JSON.stringify({
                            pieces: [
                                { name: 'Champ', use: 'reuse', reason: 'fits', id: id('Winner') },
                                {
                                    name: 'Loser',
                                    use: 'improve',
                                    reason: 'needs a slimmer bar',
                                    id: id('Box'),
                                },
                                { name: 'Note', use: 'new', reason: 'no saved note card' },
                            ],
                            code: written,
                        }),
                    );
                }
                complete(emit, composition);
            },
        },
        {
            log: (line) => logs.push(line),
            videoEmbed: async (texts) => texts.map((t) => vectors[t]),
        },
    );
    t.after(async () => {
        await env.app.stop();
        env.store.close();
    });
    const piece = (name, look, source, roles, embedding) =>
        env.store.savePiece(
            { name, look, props: ['x', 'y'], source, roles, embedding },
            'old-video',
        );
    const winner = piece('Winner', 'boxed crown', pieces, ['winner'], [1, 0.1]);
    const box = piece('Box', 'grey box', pieces.replaceAll('Winner', 'Box'), ['winner'], [0, 1]);
    const ghost = piece('Ghost', 'ghost look', pieces.replaceAll('Winner', 'Ghost'), ['winner']);
    const chat = env.store.create('Reuse', 'codex');
    await (await env.post(`/api/trees/${chat.id}/messages`, { text: 'Make a video.' })).text();
    const row = await until(() =>
        env.store.tree(chat.id).artifacts.find((a) => ['ready', 'failed'].includes(a.status)),
    );
    assert.equal(row.status, 'ready', row.error);
    assert.deepEqual(
        input.library.map((l) => [l.name, l.matches[0].name]),
        [
            ['Champ', 'Winner'],
            ['Loser', 'Box'],
            ['Note', 'Winner'],
        ],
    );
    assert.equal(
        logs.filter((l) => l.includes(' model finished ') && l.includes('stage="pieces"')).length,
        1,
    );
    assert.equal(input.library[0].matches[0].source, pieces, 'matches carry their source');
    assert.deepEqual(env.store.piece(ghost).embedding, [-1, 0], 'unembedded pieces are backfilled');
    assert.ok(input.library[0].matches.some((m) => m.name === 'Ghost'));

    const module = JSON.parse(row.source).pieces;
    assert.match(module, /export const Champ = \(\(\) => \{[\s\S]*return Winner;\n\}\)\(\);/);
    assert.match(module, /colors\.champ/);
    assert.doesNotMatch(module, /colors\.winner/, 'the reused piece takes the new roles');
    assert.equal((module.match(/from '\.\/kit'/g) ?? []).length, 1, 'imports merge');
    // The saved cut keeps the kit its export renders with.
    const kit = readFileSync(
        join(env.dir, 'video-work', row.id, row.attempt, 'cut-0', 'kit.tsx'),
        'utf8',
    );
    assert.match(kit, /"champ": palette\.leaf/, 'the new role renders in the new ink');

    assert.deepEqual(
        env.store.piece(winner).videos,
        ['old-video', row.id],
        'reuse records the video',
    );
    const improved = env.store.piece(box);
    assert.deepEqual(
        [improved.name, improved.look, improved.roles, improved.videos],
        ['Loser', looks.loser, ['loser'], ['old-video', row.id]],
        'improve makes a new version of the same piece',
    );
    assert.match(improved.source, /export function Loser\(/);
    assert.deepEqual(
        env.store.db
            .prepare('SELECT name, source FROM piece_versions WHERE piece=?')
            .all(box)
            .map((r) => ({ ...r })),
        [{ name: 'Box', source: pieces.replaceAll('Winner', 'Box') }],
        'the version older videos were made with is kept',
    );
    const fresh = env.store.db
        .prepare('SELECT id FROM pieces WHERE id NOT IN (?,?,?) ORDER BY rowid')
        .all(winner, box, ghost)
        .map((r) => env.store.piece(r.id));
    assert.deepEqual(
        fresh.map((p) => [p.name, p.look, p.roles, p.videos]),
        [['Note', looks.note, ['note'], [row.id]]],
        'only the new piece is saved as a new piece',
    );
    assert.ok(Math.abs(fresh[0].embedding[0] - 0.7) < 1e-6, 'saved with the look embedding');
    assert.deepEqual(JSON.parse(row.source).pieceChoices, [
        { piece: 'Champ', choice: 'reuse', reason: 'fits' },
        { piece: 'Loser', choice: 'improve', reason: 'needs a slimmer bar' },
        { piece: 'Note', choice: 'new', reason: 'no saved note card' },
    ]);
    assert.ok(
        logs.some((l) =>
            / media piece .*piece="Loser" choice="improve" reason="needs a slimmer bar"/.test(l),
        ),
        'the log names the choice and reason',
    );
});

test('library choices must name offered pieces and never rewrite a reused one', () => {
    const brief = { paletteRoles: { champ: 'leaf' } };
    const matches = [[{ id: 'a', name: 'Winner', roles: ['winner'], source: pieces }]];
    const answer = (pieces, code = '') => JSON.stringify({ pieces, code });
    assert.throws(
        () =>
            pieceChoices(
                answer([{ name: 'Champ', use: 'reuse', reason: 'fits', id: 'b' }]),
                ['Champ'],
                matches,
                brief,
            ),
        /not offered/,
    );
    assert.throws(
        () => pieceChoices(answer([]), ['Champ'], matches, brief),
        /no reuse, improve or new/,
    );
    assert.throws(
        () => pieceChoices(answer([{ name: 'Champ', use: 'new' }]), ['Champ'], matches, brief),
        /one-line reason/,
    );
    assert.throws(
        () =>
            pieceChoices(
                answer(
                    [{ name: 'Champ', use: 'reuse', reason: 'fits', id: 'a' }],
                    'export function Champ() {}',
                ),
                ['Champ'],
                matches,
                brief,
            ),
        /must not be written again/,
    );
    assert.throws(
        () =>
            pieceChoices(
                answer([
                    {
                        name: 'Champ',
                        use: 'reuse',
                        reason: 'fits',
                        id: 'a',
                        roles: { winner: 'x' },
                    },
                ]),
                ['Champ'],
                matches,
                brief,
            ),
        /outside the brief/,
    );
    assert.throws(() => pieceChoices(pieces, ['Champ'], matches, brief), /JSON/);
    const module = assemblePieces("import { colors } from './kit';\nconst a = 1;", [
        { name: 'Champ', inner: 'Winner', source: pieces },
    ]);
    assert.match(
        module,
        /^import \{ colors, palette \} from '\.\/kit';\nconst a = 1;\nexport const Champ/,
    );
});

test('a 3D video reuses a piece with both its forms, derives both in an improvement and saves both per entry; the adopted piece comes first with its source', async () => {
    const solid = (name, role) =>
        `export function ${name}3D({ position = [0, 0, 0] }) { return <group position={position}><mesh><boxGeometry args={[3, 2, 1]} /><meshStandardMaterial color={colors.${role}} /></mesh></group>; }`;
    const saved = {
        id: 'w',
        name: 'Winner',
        look: 'crowned box',
        props: ['x', 'y'],
        roles: ['winner'],
        source: pieces,
        source3d: `import { colors } from './kit';\n${solid('Winner', 'winner')}`,
    };
    const plan = planFor(composition, 1);
    plan.cuts[0].dimension = '3d';
    plan.styleBrief = {
        ...plan.styleBrief,
        paletteRoles: { champ: 'leaf', loser: 'rust' },
        recurringObjects: [
            { name: 'champ', position: 'centre', colorRole: 'champ', look: 'crowned box' },
            { name: 'loser', position: 'left', colorRole: 'loser', look: 'grey box', pieceId: 'c' },
        ],
    };
    const variant = `import { colors } from './kit';
export function Loser({ x, y }) { return <div style={{ left: x, top: y, background: colors.loser }} />; }
${solid('Loser', 'loser')}`;
    const inputs = [];
    const answers = [
        {
            pieces: [
                { name: 'Champ', use: 'reuse', reason: 'fits', id: 'w' },
                { name: 'Loser', use: 'improve', reason: 'fits', id: 'w' },
            ],
            code: variant + '\n' + solid('Champ', 'champ'),
        },
        {
            pieces: [
                { name: 'Champ', use: 'reuse', reason: 'fits', id: 'w' },
                { name: 'Loser', use: 'improve', reason: 'fits', id: 'w' },
            ],
            code: variant,
        },
    ];
    const { source, choices } = await writeSetPieces({
        plan,
        names: ['Champ', 'Loser'],
        matches: async () => [[saved], [saved]],
        // The plan adopted a saved piece the look search did not find.
        piece: (id) =>
            id === 'c' ? { ...saved, id: 'c', name: 'Bar', source: 'bar source' } : null,
        signal: new AbortController().signal,
        // The retry patches the code of the first answer; its piece choices stay.
        write: async (_rules, text) => {
            inputs.push(fixerTask(text));
            const answer = answers[inputs.length - 1];
            return inputs.at(-1).failedCode === undefined
                ? JSON.stringify(answer)
                : patchOf(inputs.at(-1).failedCode, answer.code);
        },
    });
    assert.equal(
        inputs[0].library[0].matches[0].source3d,
        saved.source3d,
        'matches offer the 3D form',
    );
    assert.deepEqual(
        inputs[0].library[1].matches.map((m) => [m.id, m.chosen, m.source]),
        [
            ['c', true, 'bar source'],
            ['w', undefined, pieces],
        ],
    );
    assert.match(
        inputs[1].validationError,
        /reused piece Champ must not be written again/,
        'a reused 3D form is not rewritten',
    );
    assert.match(source, /export const Champ = \(\(\) => \{[\s\S]*return Winner;/);
    assert.match(source, /export const Champ3D = \(\(\) => \{[\s\S]*return Winner3D;/);
    assert.doesNotMatch(source, /colors\.winner/, 'both reused forms take the new roles');
    assert.equal(choices[0].use, 'reuse');
    const [, loser] = libraryPieces(source, plan.styleBrief, ['Champ', 'Loser']);
    assert.match(loser.source, /export function Loser\(/);
    assert.doesNotMatch(loser.source, /Loser3D/);
    assert.match(
        loser.source3d,
        /^import \{ colors[^}]*\} from '\.\/kit';\nexport function Loser3D/,
    );
    assert.deepEqual(loser.roles, ['loser']);
});

test('a 2D-only video reusing a piece leaves its 3D form out; a saved 2D-only piece may be reused in a 3D video', () => {
    const brief = { paletteRoles: { champ: 'leaf' } };
    const flat = [[{ id: 'a', name: 'Winner', roles: ['winner'], source: pieces }]];
    const code = 'export function Champ3D() { return <group />; }';
    const answer = JSON.stringify({
        pieces: [{ name: 'Champ', use: 'reuse', reason: 'fits', id: 'a' }],
        code,
    });
    assert.equal(pieceChoices(answer, ['Champ'], flat, brief, true).choices[0].use, 'reuse');
    const solid = [[{ ...flat[0][0], source3d: 'export function Winner3D() {}' }]];
    assert.throws(() => pieceChoices(answer, ['Champ'], solid, brief, true), /written again/);
    assert.ok(pieceChoices(answer, ['Champ'], solid, brief, false), 'no 3D cut, no 3D reuse');
});

test('a plan with a 3D cut also gets a <Name>3D mesh group per object, written for a 2D-only reused piece', async () => {
    const horse = `import { colors } from './kit';
export function Horse({x, y}) { return <div style={{left:x, top:y, color:colors.winner}}>Horse</div>; }`;
    const solid = `import { colors } from './kit';
export function Horse3D({position = [0, 0, 0]}) { return <group position={position}><mesh><boxGeometry args={[3, 2, 1]} /><meshStandardMaterial color={colors.winner} /></mesh></group>; }`;
    const library = {
        id: 'drawn-horse',
        name: 'Horse',
        look: 'A horse',
        roles: ['winner'],
        source: horse,
    };
    const plan = planFor();
    plan.styleBrief = {
        ...plan.styleBrief,
        recurringObjects: [
            { name: 'horse', look: 'A horse', colorRole: 'winner', position: 'centre' },
        ],
    };
    plan.cuts[0].dimension = '3d';
    const inputs = [];
    const result = await writeSetPieces({
        plan,
        names: ['Horse'],
        matches: async () => [[library]],
        signal: new AbortController().signal,
        write: async (_rules, text) => {
            inputs.push(JSON.parse(text));
            const code = inputs.length === 1 ? '' : solid;
            return JSON.stringify({
                pieces: [{ name: 'Horse', use: 'reuse', reason: 'fits', id: library.id }],
                code,
            });
        },
    });
    assert.deepEqual(inputs[0].solidNames, ['Horse3D']);
    assert.match(inputs[1].validationError, /missing export Horse3D/);
    assert.match(result.source, /export function Horse3D/);
    const [entry] = libraryPieces(result.source, plan.styleBrief, ['Horse']);
    assert.equal(entry.name, 'Horse');
    assert.match(entry.source3d, /export function Horse3D/, 'the 3D form joins its 2D entry');
});
