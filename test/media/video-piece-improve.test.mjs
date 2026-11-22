import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
    planFor,
    composition,
    directive,
    complete,
    until,
    open,
    asksPatch,
    fixerTask,
    patchOf,
    audit,
    pass,
    planText,
} from '../support/video-kit.mjs';
import { improvePiece, improveSaved } from '../../server/media/video-pieces.mjs';
import { REMOTION_SKILL, HOUSE_STYLE_SKILL } from '../../server/media/skills.mjs';

const look = 'A rounded box 240x120 px with a crown on top';
const pieces = `import { colors, palette } from './kit';
export function Winner({ x, y, scale = 1, highlight = false }) {
  return <div style={{ position: 'absolute', left: x, top: y, background: highlight ? colors.winner : palette.raised }}>Winner</div>;
}`;
const better = pieces.replace('>Winner<', '>Crowned winner<');
const usesPieces = composition.replace(
    'import { AbsoluteFill',
    "import { Winner } from './pieces';\nimport { AbsoluteFill",
);
const snapshot = async (dir, list) => {
    for (const { file } of list) writeFileSync(file, 'jpeg');
};

async function run(t, rewrite, why = 'No crown on top') {
    const plan = planFor(usesPieces, 1);
    plan.styleBrief = {
        ...plan.styleBrief,
        recurringObjects: [{ ...plan.styleBrief.recurringObjects[0], look }],
    };
    const calls = { audit: [], improve: [], stills: [] };
    const logs = [];
    const env = await open(
        {
            generate: async (tree, text, emit) => {
                if (tree.id) return complete(emit, 'Watch.' + directive);
                if (tree.stage === 'plan') return complete(emit, planText(plan));
                if (tree.stage === 'pieces') return complete(emit, pieces);
                if (tree.stage === 'audit') {
                    calls.audit.push(JSON.parse(text));
                    return audit(tree, emit, pass, [
                        'flag_poor_piece',
                        { piece: 'Winner', reason: why },
                    ]);
                }
                if (tree.stage === 'improve') {
                    assert.ok(tree.instructions.includes(REMOTION_SKILL));
                    assert.ok(tree.instructions.includes(HOUSE_STYLE_SKILL));
                    const input = fixerTask(text);
                    calls.improve.push(input);
                    // The smart model answers a patch of the saved source.
                    return complete(
                        emit,
                        asksPatch(text) ? patchOf(input.source, rewrite) : rewrite,
                    );
                }
                complete(emit, usesPieces);
            },
        },
        {
            videoSnapshot: snapshot,
            // Library stills of the saved piece record which source they were rendered from.
            pieceSnapshot: async (dir, list) => {
                calls.stills.push(readFileSync(join(dir, 'pieces.tsx'), 'utf8'));
                await snapshot(dir, list);
            },
            log: (line) => logs.push(line),
        },
    );
    t.after(async () => {
        await env.app.stop();
        env.store.close();
    });
    const chat = env.store.create('Improve', 'codex');
    await (await env.post(`/api/trees/${chat.id}/messages`, { text: 'Make a video.' })).text();
    const row = await until(() =>
        env.store.tree(chat.id).artifacts.find((a) => ['ready', 'failed'].includes(a.status)),
    );
    assert.equal(row.status, 'ready', row.error);
    const [saved] = env.store.pieceList().pieces.map((p) => env.store.piece(p.id));
    return { row, saved, calls, logs, env };
}

test('an audit flagging a saved piece has the smart model rewrite it; the library entry is replaced, the current video keeps its piece', async (t) => {
    const { row, saved, calls, logs, env } = await run(t, better);
    assert.deepEqual(calls.audit[0].libraryPieces, ['Winner'], 'the audit is offered the piece');
    assert.equal(calls.improve.length, 1);
    assert.equal(calls.improve[0].source, pieces, 'the rewrite starts from the saved source');
    assert.equal(calls.improve[0].why, 'No crown on top');
    assert.equal(saved.source, better, 'the library entry is replaced');
    assert.ok(saved.improved > saved.created, 'last-improved time moves');
    assert.equal(JSON.parse(row.source).pieces, pieces, 'the current video keeps its piece');
    assert.ok(logs.some((l) => l.includes('stage="improve"')));
    // Stills render in the background, outside the observed job events, so poll.
    for (
        let i = 0;
        i < 100 && (calls.stills.at(-1) !== better || env.store.unstilledPieces().length);
        i++
    )
        await new Promise((r) => setTimeout(r, 10));
    assert.equal(calls.stills.at(-1), better, 'stills are rendered from the improved source');
    assert.ok(env.store.pieceStill(saved.id, '2d'), 'the improved piece gets new stills');
});

test('an off-style flag on a reused library piece redraws it in the house style for future videos', async (t) => {
    const why = 'Drawn as a flat emoji, outside the house style';
    const { saved, calls } = await run(t, better, why);
    assert.equal(calls.improve.length, 1);
    assert.equal(calls.improve[0].why, why);
    assert.equal(saved.source, better);
});

test('an invalid piece rewrite leaves the library entry unchanged', async (t) => {
    const { row, saved, calls } = await run(t, better.replace('palette.raised', "'white'"));
    assert.equal(calls.improve.length, 1);
    assert.equal(saved.source, pieces);
    assert.equal(saved.improved, saved.created);
    assert.equal(JSON.parse(row.source).pieces, pieces);
});

test('improving a piece with a 3D form rewrites both together; a rewrite missing or breaking a form is rejected', async () => {
    const solid = (label) =>
        `export function Winner3D() { return <group><mesh><meshStandardMaterial color={${label}} /></mesh></group>; }`;
    const piece = {
        name: 'Winner',
        look,
        props: ['x', 'y'],
        roles: ['winner'],
        source: pieces,
        // Saved forms each carry the module's imports.
        source3d: `import { colors, palette } from './kit';\n${solid('colors.winner')}`,
    };
    let input;
    const improve = (rewrite) =>
        improvePiece({
            piece,
            why: 'No crown',
            call: async (_rules, text) => (
                (input = fixerTask(text)),
                patchOf(input.source, rewrite)
            ),
        });
    const entry = await improve(`${better}\n${solid('palette.raised')}`);
    assert.equal(input.source3d, true);
    assert.equal(
        input.source,
        `${pieces}\n${solid('colors.winner')}`,
        'one module holds both forms, imports once',
    );
    assert.match(entry.source, /Crowned winner/);
    assert.doesNotMatch(entry.source, /Winner3D/);
    assert.match(entry.source3d, /export function Winner3D[\s\S]*palette\.raised/);
    await assert.rejects(improve(better), /missing export Winner3D/);
    await assert.rejects(improve(`${better}\n${solid("'red'")}`), /style brief colors/);
    const flat = await improvePiece({
        piece: { ...piece, source3d: undefined },
        why: 'x',
        call: async (_rules, text) => ((input = fixerTask(text)), patchOf(input.source, better)),
    });
    assert.ok(!('source3d' in input) && !flat.source3d, 'a 2D-only piece stays 2D-only');
});

test('improving a piece built from parts names them so the rewrite draws them instead of defining them', async () => {
    let input;
    const entry = await improvePiece({
        piece: {
            name: 'Winner',
            look,
            props: ['x', 'y'],
            roles: ['winner'],
            source: pieces,
            parts: [{ name: 'Crown', id: 'c' }],
        },
        why: 'x',
        call: async (_rules, text) => ((input = fixerTask(text)), patchOf(input.source, better)),
    });
    assert.deepEqual(input.parts, ['Crown']);
    assert.deepEqual(entry.parts, [], 'the saved parts are kept by the store, not the rewrite');
});

test('a piece patch that does not apply gets exactly one whole-source rewrite with both saved forms', async () => {
    const piece = {
        name: 'Winner',
        look,
        props: ['x', 'y'],
        roles: ['winner'],
        source: pieces,
        source3d: `import { colors, palette } from './kit';\nexport function Winner3D() { return <group />; }`,
    };
    const calls = [];
    const entry = await improvePiece({
        piece,
        why: 'x',
        call: async (_, text) => {
            calls.push(asksPatch(text) ? 'patch' : JSON.parse(text));
            return calls.length === 1
                ? patchOf('unrelated\nlines\n', 'other\n')
                : `${better}\nexport function Winner3D() { return <group />; }`;
        },
    });
    assert.equal(calls.length, 2);
    assert.equal(calls[0], 'patch');
    assert.equal(calls[1].source, piece.source);
    assert.equal(calls[1].source3d, piece.source3d);
    assert.match(entry.source, /Crowned winner/);
});

test('a piece improvement cut short by a stopped job never rejects', async () => {
    const controller = new AbortController();
    controller.abort(new Error('cut failed'));
    const warnings = [];
    await improveSaved({ signal: controller.signal }, 'p1', 'why', {
        store: {
            piece: () => {
                throw new Error('gone');
            },
        },
        stills() {},
        onWarning: (w) => warnings.push(w),
    });
    assert.deepEqual(warnings, []);
});
