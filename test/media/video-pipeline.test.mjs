import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';
import { generateVideo } from '../../server/media/videos.mjs';
import { ENGINES } from '../../server/media/cut-engines.mjs';
import { fakeNarration } from '../support/fake-narration.mjs';
import { planFor, planCalls, composition, fixerTask, patchOf } from '../support/video-kit.mjs';

const broken = "import fs from 'node:fs';\n" + composition;
const fixed = composition.replace('PRIVATE_SOURCE_MARKER', 'FIXED');

// One video in the given Video mode, switched to later once planned: cut 2 is first written broken, and cut 1's
// audit flags it.
async function run(mode, later) {
    const dir = mkdtempSync(join(tmpdir(), 'tt-pipeline-'));
    const store = new Store(join(dir, 'trees.sqlite'));
    if (mode) store.saveVideoMode(mode);
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
    const asked = [];
    // One fake model call answers both roles by stage.
    const model = async (_instructions, input, { stage, cut, tools }) => {
        asked.push(cut ? `${stage} ${cut}` : stage);
        if (stage === 'plan') {
            if (later) store.saveVideoMode(later);
            for (const [name, args = {}] of planCalls(planFor(composition, 2)))
                await tools.runTool(name, args);
            return '';
        }
        if (stage === 'cut') return cut === 2 ? broken : composition;
        if (stage === 'repair') {
            assert.match(fixerTask(input).validationError, /import/i);
            return patchOf(fixerTask(input).failedCode, composition);
        }
        if (stage === 'audit') {
            await tools.runTool(
                ...(cut === 1
                    ? [
                          'flag_problem',
                          { cut: 'sentence 1', problem: 'The label leaves the frame.' },
                      ]
                    : ['pass_cut', {}]),
            );
            return '';
        }
        if (stage === 'fix')
            return JSON.stringify({ patch: patchOf(fixerTask(input).code, fixed) });
        throw new Error(`unexpected ${stage}`);
    };
    const engine = {
        ...ENGINES.remotion,
        ready() {},
        async check() {},
        play: async () => null,
        async stills(_dir, stills) {
            for (const { file } of stills) writeFileSync(file, 'jpeg');
        },
    };
    const stages = [];
    const ready = await generateVideo(
        { dir, artifact, signal: new AbortController().signal },
        {
            call: model,
            write: model,
            engines: () => ({ remotion: engine }),
            store,
            narrate: fakeNarration,
            onStage: (name) => stages.push(name),
        },
    );
    const { cuts } = JSON.parse(store.artifact(tree.id, artifact.id).source);
    store.close();
    return { ready, asked, cuts, stages };
}

test('the pipeline runs from plan to saved video on a fake model call and a fake engine; switching to Saving mid-video changes nothing', async () => {
    const { ready, asked, cuts, stages } = await run('quality', 'saving');
    assert.equal(ready.status, 'ready');
    assert.equal(asked[0], 'plan');
    assert.deepEqual(
        asked.slice(1).sort(),
        ['audit 1', 'cut 1', 'cut 2', 'fix 1', 'repair 2'],
        'a repair is also its cut audit; the audit issue is fixed',
    );
    assert.ok(asked.indexOf('fix 1') > asked.indexOf('audit 1'));
    assert.deepEqual(
        cuts.map((c) => [c.status, c.audited, c.code]),
        [
            ['written', true, fixed.trim()],
            ['written', true, composition.trim()],
        ],
    );
    assert.ok(stages.includes('playable') && stages.indexOf('playable') < stages.indexOf('saved'));
});

test('a video started in Saving mode makes no audit, fix or piece improvement, still repairs a broken cut and is saved', async () => {
    const { ready, asked, cuts, stages } = await run('saving');
    assert.equal(ready.status, 'ready');
    assert.equal(asked[0], 'plan');
    assert.deepEqual(asked.slice(1).sort(), ['cut 1', 'cut 2', 'repair 2']);
    assert.deepEqual(
        cuts.map((c) => [c.status, c.code]),
        [
            ['written', composition.trim()],
            ['written', composition.trim()],
        ],
    );
    assert.ok(stages.includes('saved'));
});
