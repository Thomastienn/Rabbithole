import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';
import { generateVideo } from '../../server/media/videos.mjs';
import { planBuilder } from '../../server/media/plan-calls.mjs';
import { fakeNarration } from '../support/fake-narration.mjs';
import { planFor, planCalls, complete, composition, noSnapshot } from '../support/video-kit.mjs';

// A planner that calls tools natively: each attempt's calls go through tree.runTool, whose errors it reads back.
async function plan(attempts) {
    const dir = mkdtempSync(join(tmpdir(), 'tt-plan-calls-'));
    const store = new Store(join(dir, 'trees.sqlite'));
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
    const error = await generateVideo({
        provider: {
            generate: async (t, _text, emit) => {
                if (!t.instructions.startsWith('You plan')) return complete(emit, composition);
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
        selection: {},
        store,
        dir,
        artifact,
        signal: new AbortController().signal,
        snapshot: noSnapshot,
        narrate: fakeNarration,
        capable: true,
    }).then(
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
