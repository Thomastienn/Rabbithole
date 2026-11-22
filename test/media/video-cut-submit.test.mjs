import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';
import { generateVideo, videoEngines } from '../../server/media/videos.mjs';
import { SUBMIT_NOTE } from '../../server/media/video-cut.mjs';
import { CUT_ATTEMPTS, CUT_CHECKS } from '../../server/media/video-plan.mjs';
import { fakeNarration } from '../support/fake-narration.mjs';
import {
    planFor,
    planText,
    complete,
    composition,
    audit,
    pass,
    patchOf,
    fixerTask,
    models,
} from '../support/video-kit.mjs';

const broken = "import fs from 'node:fs';\n" + composition;

// A tool-calling cut writer: each call submits the given sources (or {patch}) in order through submit_cut and reads the answers.
async function video(submissions) {
    const dir = mkdtempSync(join(tmpdir(), 'tt-cut-submit-'));
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
    const writers = [],
        results = [];
    const error = await generateVideo(
        { dir, artifact, signal: new AbortController().signal },
        {
            ...models(
                {
                    generate: async (t, text, emit) => {
                        if (t.stage === 'plan') return complete(emit, planText(planFor()));
                        if (t.stage === 'audit') return audit(t, emit, pass);
                        writers.push({ tree: t, task: fixerTask(text) });
                        for (const s of submissions)
                            try {
                                results.push(
                                    await t.runTool(
                                        'submit_cut',
                                        typeof s === 'string' ? { code: s } : s,
                                    ),
                                );
                            } catch (e) {
                                results.push(`Error: ${e.message}`);
                            }
                        complete(emit, '');
                    },
                },
                { writerCapable: true },
            ),
            store,
            engines: videoEngines({ snapshot: async () => {} }),
            narrate: fakeNarration,
        },
    ).then(
        () => null,
        (e) => e.message,
    );
    const row = store.artifact(tree.id, artifact.id);
    return { error, row, writers, results };
}

test('a tool-calling writer reads the validation error and fixes the cut in the same call', async () => {
    const { error, row, writers, results } = await video([broken, composition]);
    assert.equal(error, null);
    assert.equal(row.status, 'ready', row.error);
    assert.equal(writers.length, 1, 'the fix spends no repair attempt');
    assert.ok(writers[0].tree.instructions.includes(SUBMIT_NOTE));
    assert.deepEqual(
        writers[0].tree.tools.map((t) => t.name),
        ['submit_cut'],
    );
    assert.match(results[0], /^Error: .*import/i);
    assert.equal(results[1], 'Cut accepted. End your turn.');
    assert.equal(JSON.parse(row.source).cuts[0].code, composition.trim());
});

test('a writer that never passes runs out of checks, then repairs with the last error, then fails', async () => {
    const { error, writers, results } = await video(Array(CUT_CHECKS + 1).fill(broken));
    assert.match(error, /^Cut 1 of 1: .*import/i);
    assert.equal(writers.length, CUT_ATTEMPTS);
    assert.equal(results[CUT_CHECKS], 'Error: No checks left; end your turn.');
    assert.match(writers[1].task.validationError, /import/i);
    assert.equal(writers[1].task.failedCode, broken);
});

test('a tool-calling writer may fix its last submission with a patch', async () => {
    const fixed = composition.replace('PRIVATE_SOURCE_MARKER', 'PATCHED');
    const { error, row, results } = await video([
        broken,
        { patch: 'not a diff' },
        { patch: patchOf(broken, fixed) },
    ]);
    assert.equal(error, null);
    assert.equal(results[1], 'Error: patch does not apply; submit the whole source as code.');
    assert.equal(results[2], 'Cut accepted. End your turn.');
    assert.equal(JSON.parse(row.source).cuts[0].code, fixed.trim());
});
