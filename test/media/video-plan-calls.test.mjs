import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';
import { generateVideo, videoEngines } from '../../server/media/videos.mjs';
import { planBuilder, PIECES_PLAN_NOTE } from '../../server/media/plan-calls.mjs';
import { fakeNarration } from '../support/fake-narration.mjs';
import {
    planFor,
    planCalls,
    complete,
    composition,
    noSnapshot,
    models,
} from '../support/video-kit.mjs';

// A planner that calls tools natively: each attempt's calls go through tree.runTool, whose errors it reads back.
// pieces are saved to the library first; embed is the embedder.
async function plan(attempts, { pieces = [], embed } = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'tt-plan-calls-'));
    const store = new Store(join(dir, 'trees.sqlite'));
    for (const piece of pieces) store.savePiece(piece);
    const tree = store.create('Video', 'codex');
    const message = store.message(tree.id, 'assistant', 'Reply.', 'completed');
    const artifact = store.pendingArtifact(
        tree.id,
        message,
        'Title',
        'Planned.',
        'video',
        '{"request":"Make a video."}',
    );
    const plans = [],
        results = [];
    const error = await generateVideo(
        { dir, artifact, signal: new AbortController().signal },
        {
            ...models(
                {
                    generate: async (t, _text, emit) => {
                        if (t.stage !== 'plan') return complete(emit, composition);
                        plans.push(t);
                        for (const [name, input = {}] of attempts[plans.length - 1] ?? [])
                            try {
                                results.push(await t.runTool(name, input));
                            } catch (e) {
                                results.push(`Error: ${e.message}`);
                            }
                        complete(emit, '');
                    },
                },
                { capable: true },
            ),
            store,
            engines: videoEngines({ snapshot: noSnapshot }),
            narrate: fakeNarration,
            embed,
        },
    ).then(
        () => null,
        (e) => e.message,
    );
    const row = store.artifact(tree.id, artifact.id);
    return { error, row, plans, results, saved: row.source && JSON.parse(row.source).plan };
}

test('a plan built through valid native calls produces a video as before', async () => {
    const want = planFor(composition, 2);
    const { error, row, plans, saved } = await plan([planCalls(want)]);
    assert.equal(error, null);
    assert.equal(row.status, 'ready');
    assert.equal(plans.length, 1);
    assert.ok(plans[0].tools.some((t) => t.name === 'add_cut'));
    assert.ok(
        !plans[0].instructions.includes('<tool_call>'),
        'native planners get no text-call note',
    );
    assert.deepEqual(saved, want);
    // An empty library offers no piece lookup.
    assert.ok(!plans[0].tools.some((t) => t.name === 'find_pieces'));
    assert.ok(!plans[0].instructions.includes(PIECES_PLAN_NOTE));
});

test('with saved pieces the planner looks up the 5 nearest by name and role, without source, before writing a look', async () => {
    const saved = Array.from({ length: 6 }, (_, i) => ({
        name: `Saved${i}`,
        look: `look ${i}`,
        props: ['x', 'y'],
        source: `export function Saved${i}() { return null; }`,
        roles: [],
        embedding: [1, i],
    }));
    const queries = [];
    const embed = async (texts) => {
        queries.push(...texts);
        return texts.map(() => [1, 0]);
    };
    const want = planFor(composition, 1);
    const winner = { name: 'Winner', position: 'centre', colorRole: 'winner', look: 'look 0' };
    const calls = planCalls(want).flatMap((c) =>
        c[0] === 'add_object'
            ? [
                  ['add_object', winner],
                  ['find_pieces', { name: 'Winner', role: 'the crowned finalist' }],
                  ['add_object', { ...winner, piece: 'Saved5' }],
                  ['add_object', { ...winner, piece: 'Saved0' }],
              ]
            : [c],
    );
    const { plans, results, saved: stored } = await plan([calls], { pieces: saved, embed });
    assert.ok(plans[0].instructions.includes(PIECES_PLAN_NOTE));
    assert.match(PIECES_PLAN_NOTE, /adopt the saved piece's look and name it as piece/);
    const at = calls.findIndex((c) => c[0] === 'add_object');
    assert.equal(
        results[at],
        'Error: call find_pieces with its name and role before giving it a look.',
    );
    assert.deepEqual(
        JSON.parse(results[at + 1]),
        [0, 1, 2, 3, 4].map((i) => ({ name: `Saved${i}`, look: `look ${i}` })),
    );
    assert.ok(queries.includes('Winner: the crowned finalist'));
    assert.equal(
        results[at + 2],
        'Error: piece must name a saved piece find_pieces returned for this object.',
    );
    assert.deepEqual(stored.styleBrief.recurringObjects, [{ ...winner, piece: 'Saved0' }]);

    // Text-mode calls get no result back, so they keep today's tools and need no lookup.
    const builder = planBuilder({ pieces: async () => [] });
    assert.ok(!builder.textTools.includes('find_pieces"'));
    assert.ok(!builder.textTools.includes('"piece"'));
    const { colorRole, ...plain } = winner;
    builder.read(
        `<tool_call>${JSON.stringify({ name: 'add_object', arguments: plain })}</tool_call>`,
    );
    assert.deepEqual(builder.plan().styleBrief.recurringObjects, [plain]);
});

test('a bad field gets an error naming it, the corrected call is accepted and a bad join becomes a scene change', async () => {
    const want = planFor(composition, 2);
    const calls = planCalls(want);
    const at = calls.findIndex(([name]) => name === 'add_cut');
    calls.splice(at, 0, ['add_cut', { ...calls[at][1], engine: 'flash' }]);
    calls[at + 2] = ['add_cut', { ...calls[at + 2][1], join: 'jump', transition: 'dissolve' }];
    const { error, row, results, saved } = await plan([calls]);
    assert.equal(results[at], 'Error: engine must be "remotion" or "manim".');
    assert.equal(results[at + 1], 'Cut 1 added.');
    assert.equal(error, null);
    assert.equal(row.status, 'ready');
    assert.equal(saved.cuts.length, 2);
    assert.equal(saved.cuts[1].join, 'scene');
    assert.equal(saved.cuts[1].transition, undefined);
});

test('a plan with no cuts gets one retry with the problem stated, then fails naming it', async () => {
    const empty = [['start_video', { title: 'T', description: 'D.' }], ['finish_video']];
    const { error, plans, results } = await plan([empty, empty]);
    assert.equal(plans.length, 2);
    assert.match(results[1], /^Error: The plan has no cuts;/);
    assert.match(plans[1].instructions, /stopped without a valid finish: the plan has no cuts\./);
    assert.equal(error, 'Video plan is incomplete: the plan has no cuts.');
    // The retry itself can still succeed.
    const recovered = await plan([empty, planCalls(planFor())]);
    assert.equal(recovered.error, null);
    assert.equal(recovered.row.status, 'ready');
});

test('text-mode calls are read in order and a rejected one is named in the problem', () => {
    const builder = planBuilder();
    builder.read(
        '<tool_call>{"name": "start_video", "arguments": {"title": "", "description": "D."}}</tool_call>',
    );
    assert.equal(
        builder.problem(),
        'the plan has no valid title (call start_video); rejected calls: start_video: title must be a short title, at most 160 characters.',
    );
    assert.equal(planBuilder().problem(), 'no plan calls were made');
});
