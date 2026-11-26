import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
    directive,
    composition,
    styleBrief,
    task,
    complete,
    until,
    open,
    planText,
} from '../support/video-kit.mjs';
import { fakeNarration } from '../support/fake-narration.mjs';
import { observe, notify } from '../support/events.mjs';

const plan = {
    title: task.title,
    description: task.description,
    styleBrief: {
        ...styleBrief,
        paletteRoles: { ...styleBrief.paletteRoles, earth: 'earthBlue' },
        trueColors: { earthBlue: '#2f6fb5' },
    },
    cuts: ['First.', 'Second.', 'Third.'].map((narration, i) => ({
        purpose: `Step ${i + 1}`,
        engine: 'remotion',
        dimension: '2d',
        narration,
        endState: `Winner at position ${i + 1}`,
    })),
};
const emphasis = [{ tool: 'cursor', sentence: 0, x: 960, y: 400, label: 'Winner' }];
plan.cuts[0].emphasis = emphasis;

test('a video plays live once cuts 1 and 2 are ready while later cuts are pending, with phases in order and real counts', async () => {
    const gates = {},
        opened = {};
    const gate = (name) => {
        opened[name] = true;
        notify();
        return new Promise((resolve) => (gates[name] = resolve));
    };
    const release = async (name) => {
        await until(() => opened[name]);
        gates[name]();
    };
    let generations = 0;
    const provider = {
        generate: async (tree, text, emit) => {
            generations++;
            if (tree.stage === 'plan') {
                await gate('plan');
                return complete(emit, planText(plan));
            }
            if (tree.stage === 'cut') {
                const step = JSON.parse(text).cut.purpose;
                await gate({ 'Step 1': 'first', 'Step 2': 'second' }[step] ?? 'third');
                return complete(emit, composition);
            }
            complete(emit, 'Before.\n' + directive + '\n\nAfter.');
        },
    };
    const videoNarrate = async (text) => {
        if (text === 'First.') await gate('voice');
        return fakeNarration();
    };
    let renders = 0;
    const videoRender = async () => {
        renders++;
    };
    const env = await open(provider, { videoRender, videoNarrate });
    // Phases follow saved cut state, so wake waiters on each save.
    observe(env.store, ['videoData']);
    try {
        const tree = env.store.create('Video', 'codex');
        await (await env.post(`/api/trees/${tree.id}/messages`, { text: 'Make a video.' })).text();
        const artifact = async () =>
            (await (await env.get(`/api/trees/${tree.id}`)).json()).artifacts[0];
        const seen = [];
        const at = async (phase) => {
            await until(async () => (await artifact()).phase === phase);
            const a = await artifact();
            seen.push([a.phase, a.cut, a.cuts]);
            return a;
        };
        const { id } = await at('planning');
        const cuts = `/api/trees/${tree.id}/artifacts/${id}/cuts`;
        assert.equal((await env.get(cuts)).status, 404, 'no live cuts before the plan');
        await release('plan');
        await at('writing');
        await release('first');
        await at('narrating');
        await release('voice');
        // Cut 1 alone is not enough while cut 2 is still being written.
        await until(async () => (await (await env.get(cuts)).json()).cuts[0].playable);
        assert.notEqual((await artifact()).phase, 'playable', 'one playable cut is not enough');
        await release('second');
        const playable = await at('playable');
        assert.equal(playable.status, 'pending');
        // Cuts 1 and 2 are live: compiled code (no TypeScript or JSX left), timing and narration; cut 3 is still being written.
        const live = await (await env.get(cuts)).json();
        assert.deepEqual(live.paletteRoles, plan.styleBrief.paletteRoles);
        assert.deepEqual(
            live.trueColors,
            { earthBlue: '#2f6fb5' },
            'true colour roles resolve live',
        );
        assert.deepEqual(
            live.cuts.map((c) => [c.engine, c.playable, typeof c.code]),
            [
                ['remotion', true, 'string'],
                ['remotion', true, 'string'],
                ['remotion', false, 'object'],
            ],
        );
        assert.match(live.cuts[0].code, /require\("remotion"\)/);
        assert.doesNotMatch(live.cuts[0].code, /<AbsoluteFill|^import /m);
        assert.equal(live.cuts[0].timing.durationInFrames, 75);
        assert.deepEqual(
            [live.cuts[0].timing.entry, live.cuts[0].timing.exit],
            [null, { join: 'scene', transition: 'fade' }],
            'live cut data carries the joins into and out of the cut',
        );
        assert.deepEqual(
            live.cuts.map((c) => c.emphasis),
            [emphasis, [], []],
        );
        const voice = await env.get(`${cuts}/0/narration`);
        assert.equal(voice.headers.get('content-type'), 'audio/mpeg');
        assert.deepEqual(
            Buffer.from(await voice.arrayBuffer()),
            Buffer.from((await fakeNarration()).audio),
        );
        for (const path of ['2/narration', '0/clip', '9/narration'])
            assert.equal((await env.get(`${cuts}/${path}`)).status, 404, path);
        assert.equal((await env.get(`/api/trees/other/artifacts/${id}/cuts`)).status, 404);
        // The library plays the live version while the video is generating.
        assert.deepEqual(
            (await (await env.get('/api/videos')).json()).videos.map((v) => [
                v.id,
                v.live,
                v.origin,
            ]),
            [[id, tree.id, 'Video']],
        );
        await release('third');
        await until(async () => (await artifact()).status === 'ready');
        await env.app.settled();
        assert.deepEqual(seen, [
            ['planning', undefined, undefined],
            ['writing', 0, 3],
            ['narrating', undefined, undefined],
            ['playable', 2, 3],
        ]);
        // Saving makes no render call; the saved video keeps playing live from its cuts.
        assert.equal(renders, 0);
        assert.equal((await artifact()).exported, false);
        assert.ok((await (await env.get(cuts)).json()).cuts.every((c) => c.playable));
        assert.deepEqual(
            (await (await env.get('/api/videos')).json()).videos.map((v) => [
                v.id,
                v.live,
                v.exported,
                v.available,
            ]),
            [[id, undefined, false, undefined]],
        );
        // After its tree is deleted, the library still plays the unexported video by its id, without a provider.
        const library = `/api/videos/${id}/cuts`,
            calls = generations,
            saved = await (await env.get(cuts)).json();
        assert.equal(
            (await env.post(`/api/trees/${tree.id}/delete`, { conversation: tree.id })).status,
            200,
        );
        assert.equal((await env.get(cuts)).status, 404, 'the tree route is gone');
        assert.deepEqual(await (await env.get(library)).json(), saved);
        assert.deepEqual(
            Buffer.from(await (await env.get(`${library}/2/narration`)).arrayBuffer()),
            Buffer.from((await fakeNarration()).audio),
        );
        assert.equal(generations, calls, 'library playback never calls a provider');
        // Trashing removes its production work and library entry.
        const trashed = await env.post(`/api/videos/${id}/trash`);
        assert.deepEqual(await trashed.json(), { trashed: false, missing: true });
        assert.equal(existsSync(join(env.dir, 'video-work', id)), false);
        assert.deepEqual((await (await env.get('/api/videos')).json()).videos, []);
        assert.equal((await env.get(library)).status, 404);
    } finally {
        env.close();
    }
});
