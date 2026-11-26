import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { mediaPath } from '../../server/media/videos.mjs';
import {
    audit,
    pass,
    mp4,
    task,
    directive,
    composition,
    videoResponse,
    complete,
    until,
    open,
    job,
} from '../support/video-kit.mjs';

test('a malformed video block the learner asked for becomes a visible failed video with a reason, and Retry runs it from the stored request', async () => {
    const workers = [];
    let block;
    const provider = {
        generate: async (tree, text, emit) => {
            if (!tree.id) {
                if (tree.stage === 'plan') workers.push(JSON.parse(text));
                return complete(emit, videoResponse(tree));
            }
            complete(emit, 'Sure.\n```rabbithole-video\n' + block);
        },
    };
    const env = await open(provider);
    try {
        // Regression replay: tutors have sent a stray key plus a missing field, which used to be dropped silently.
        const request = 'Make a video of how Earth orbits the Sun.';
        for (const [value, reason, expected = {}, closed = true] of [
            [
                JSON.stringify({
                    title: 'Orbits',
                    description: 'Earth orbits.',
                    excerpt: 'Earth',
                    style: 'fun',
                }),
                /missing intent/,
                { excerpt: 'Earth' },
            ],
            ['{"title": "Orbits",', /not valid JSON/],
            [
                JSON.stringify({ ...task, intent: '  ' }),
                /missing intent/,
                { excerpt: task.excerpt },
            ],
            [
                JSON.stringify({ ...task, description: 12 }),
                /missing description/,
                { intent: task.intent, excerpt: task.excerpt },
            ],
            ['null', /not a JSON object/],
            ['[]', /not a JSON object/],
            [JSON.stringify(task), /cut off before it closed/, {}, false],
        ]) {
            block = value + (closed ? '\n```' : '');
            const tree = env.store.create('Bad video', 'codex');
            const stream = await (
                await env.post(`/api/trees/${tree.id}/messages`, { text: request })
            ).text();
            assert.ok(!stream.includes('rabbithole-video'));
            const [failed] = (await (await env.get(`/api/trees/${tree.id}`)).json()).artifacts;
            assert.equal(failed.kind, 'video');
            assert.equal(failed.status, 'failed');
            assert.match(failed.error, /^Video request could not be read: /);
            assert.match(failed.error, reason);
            assert.equal(failed.input, undefined);
            assert.equal(failed.position, 'Sure.'.length);
            assert.equal(workers.length, 0, 'a rejected request never starts by itself');
            assert.equal(
                (await env.post(`/api/trees/${tree.id}/artifacts/${failed.id}/retry`)).status,
                200,
            );
            await until(() => env.store.artifact(tree.id, failed.id).status === 'ready');
            const sent = workers.pop();
            assert.equal(sent.request, request);
            assert.equal(
                sent.intent,
                expected.intent ?? request,
                'readable fields survive; missing intent falls back to the learner request',
            );
            assert.equal(sent.excerpt, expected.excerpt ?? '');
            assert.equal(env.store.tree(tree.id).messages.length, 2);
        }
        // Valid tolerant slip: unknown keys and long fields still start the job directly.
        block = JSON.stringify({ ...task, style: 'fun', intent: 'i'.repeat(17000) }) + '\n```';
        const tree = env.store.create('Slip', 'codex');
        await (
            await env.post(`/api/trees/${tree.id}/messages`, { text: 'Make a video of the final.' })
        ).text();
        await until(() => env.store.tree(tree.id).artifacts[0]?.status === 'ready');
        assert.equal(workers.pop().intent, 'i'.repeat(600));
    } finally {
        env.close();
    }
});

test('mixed and duplicate video blocks each leave a failed artifact of their own kind without starting workers', async () => {
    let blocks;
    let workers = 0;
    const env = await open({
        generate: async (tree, text, emit) => {
            if (!tree.id) {
                workers++;
                return complete(emit, videoResponse(tree));
            }
            complete(emit, 'Visible answer.' + blocks);
        },
    });
    try {
        for (const kinds of [
            ['diagram', 'video'],
            ['video', 'video'],
        ]) {
            blocks = kinds
                .map((kind) => `\n\`\`\`rabbithole-${kind}\n${JSON.stringify(task)}\n\`\`\``)
                .join('');
            const tree = env.store.create('Multiple requests', 'codex');
            const stream = await (
                await env.post(`/api/trees/${tree.id}/messages`, {
                    text: 'Make a video of winners advancing.',
                })
            ).text();
            const saved = await (await env.get(`/api/trees/${tree.id}`)).json();
            assert.equal(saved.messages.at(-1).text, 'Visible answer.');
            assert.doesNotMatch(stream, /rabbithole-(diagram|video)/);
            assert.deepEqual(
                saved.artifacts.map((a) => [a.kind, a.status]),
                kinds.map((kind) => [kind === 'diagram' ? 'mermaid' : kind, 'failed']),
            );
            assert.ok(saved.artifacts.every((a) => a.error && a.input === undefined));
        }
        assert.equal(workers, 0);
    } finally {
        env.close();
    }
});

test('provider failure and learner Stop preserve legacy diagram request failures without starting media work', async () => {
    let mode, entered;
    let workers = 0;
    const env = await open({
        generate: async (tree, text, emit, save, signal) => {
            if (!tree.id) {
                workers++;
                return complete(emit, videoResponse(tree));
            }
            emit({
                type: 'item',
                item: 'answer',
                text: `Saved text.\n\`\`\`rabbithole-diagram\n${JSON.stringify(task)}\n\`\`\``,
            });
            entered?.();
            if (mode === 'throw') throw new Error('private provider failure');
            await new Promise((resolve) =>
                signal.addEventListener('abort', resolve, { once: true }),
            );
        },
    });
    try {
        for (mode of ['throw', 'stop']) {
            const tree = env.store.create('Interrupted requests', 'codex');
            const ready = new Promise((resolve) => {
                entered = resolve;
            });
            const response = env
                .post(`/api/trees/${tree.id}/messages`, {
                    text: 'Make a video of winners advancing.',
                })
                .then((r) => r.text());
            await ready;
            if (mode === 'stop')
                assert.equal((await env.post(`/api/trees/${tree.id}/stop`)).status, 200);
            await response;
            const saved = await (await env.get(`/api/trees/${tree.id}`)).json();
            assert.deepEqual(
                saved.artifacts.map((a) => [a.kind, a.status, a.error]),
                [['mermaid', 'failed', 'Tutor reply did not complete.']],
            );
            assert.equal(saved.messages.at(-1).text, 'Saved text.');
        }
        assert.equal(workers, 0);
    } finally {
        env.close();
    }
});

test('deleting a conversation while its request block is streaming cannot recreate its artifacts', async () => {
    let entered;
    const started = new Promise((resolve) => {
        entered = resolve;
    });
    const env = await open({
        generate: async (tree, text, emit, save, signal) => {
            emit({ type: 'item', item: 'answer', text: 'Saved text.' + directive });
            entered();
            await new Promise((resolve) =>
                signal.addEventListener('abort', resolve, { once: true }),
            );
        },
    });
    try {
        const tree = env.store.create('Delete requests', 'codex');
        const response = env
            .post(`/api/trees/${tree.id}/messages`, { text: 'Make a video of winners advancing.' })
            .then((r) => r.text());
        await started;
        assert.equal(
            (await env.post(`/api/trees/${tree.id}/delete`, { conversation: tree.id })).status,
            200,
        );
        await response;
        assert.equal((await env.get(`/api/trees/${tree.id}`)).status, 404);
        assert.deepEqual((await (await env.get('/api/state')).json()).active, []);
    } finally {
        env.close();
    }
});

test('Try a new version plans from the current video as the learner asks; the chat shows only the newest, the library keeps both and Previous version switches back', async () => {
    const workers = [];
    const audits = [];
    let release,
        held = false;
    const env = await open(
        {
            generate: async (tree, text, emit) => {
                if (tree.role === 'video') {
                    if (tree.stage === 'audit') {
                        audits.push(workers.length);
                        return audit(tree, emit, pass);
                    }
                    if (tree.stage === 'plan') workers.push({ tree, text });
                    if (held && tree.stage === 'plan')
                        await new Promise((r) => {
                            release = r;
                        });
                    const source =
                        workers.length === 1
                            ? composition
                            : composition
                                  .replace('Winners advance.', 'Both winners advance.')
                                  .replace('A + B → Final', 'Both winners → Final');
                    return complete(emit, videoResponse(tree, source));
                }
                complete(emit, 'Here is the idea.' + directive);
            },
        },
        {
            videoSnapshot: async (_dir, frames) => {
                for (const { file } of frames) writeFileSync(file, 'jpeg');
            },
        },
    );
    try {
        const tree = env.store.create('Videos', 'codex');
        await (
            await env.post(`/api/trees/${tree.id}/messages`, {
                text: 'Make a video of the winners advancing.',
            })
        ).text();
        const first = await until(() =>
            env.store.tree(tree.id).artifacts.find((a) => a.status === 'ready'),
        );
        const url = `/api/trees/${tree.id}/artifacts/${first.id}/regenerate`;
        assert.equal(
            (
                await env.post(
                    `/api/trees/${env.store.create('Foreign', 'codex').id}/artifacts/${first.id}/regenerate`,
                )
            ).status,
            404,
        );
        const firstPlan = JSON.parse(env.store.artifact(tree.id, first.id).source).plan;
        const artifactUrl = (id) => `/api/trees/${tree.id}/artifacts/${id}`;
        const cuts = async (id) => {
            const response = await env.get(`${artifactUrl(id)}/cuts`);
            assert.equal(response.status, 200);
            return response.json();
        };
        const bytes = async (url) => {
            const response = await env.get(url);
            assert.equal(response.status, 200);
            return Buffer.from(await response.arrayBuffer());
        };
        const firstCuts = await cuts(first.id);
        assert.equal(firstCuts.cuts[0].playable, true);
        const firstAudio = await bytes(`${artifactUrl(first.id)}/cuts/0/narration`);
        mkdirSync(join(env.dir, 'videos'), { recursive: true });
        writeFileSync(mediaPath(env.dir, first.id), mp4);
        assert.deepEqual(audits, [1], 'the original was made in Quality mode');
        const videoModeUrl = '/api/settings/video-mode';
        assert.equal((await env.post(videoModeUrl, { mode: 'saving' })).status, 200);
        held = true;
        assert.equal((await env.post(url, { instruction: 'x'.repeat(501) })).status, 400);
        const response = await env.post(url, { input: 'UNTRUSTED', instruction: ' Slower pace ' });
        assert.equal(response.status, 200);
        const next = await response.json();
        assert.notEqual(next.id, first.id);
        assert.equal(next.status, 'pending');
        assert.equal(next.input, undefined);
        assert.equal(next.message, first.message);
        assert.equal(next.position, first.position);
        await until(() => workers.length === 2);
        assert.equal(
            (await env.post(`/api/trees/${tree.id}/artifacts/${next.id}/regenerate`)).status,
            409,
            'one generation at a time',
        );
        assert.equal((await env.post(url)).status, 404, 'the previous id is no longer in the chat');
        // The previous video stays in the library while the new one is made.
        assert.deepEqual(
            (await (await env.get('/api/videos')).json()).videos.map((v) => [v.id, v.exported]),
            [[first.id, true]],
        );
        assert.deepEqual(await bytes(`/api/videos/${first.id}/media`), mp4);
        assert.equal((await env.post(videoModeUrl, { mode: 'quality' })).status, 200);
        release();
        await until(() =>
            env.store.tree(tree.id).artifacts.find((a) => a.id === next.id && a.status === 'ready'),
        );
        const saved = await (await env.get(`/api/trees/${tree.id}`)).json();
        assert.deepEqual(
            saved.artifacts.map((a) => a.id),
            [next.id],
            'the chat shows only the newest',
        );
        assert.deepEqual(
            (await (await env.get('/api/videos')).json()).videos.map((v) => v.id).sort(),
            [first.id, next.id].sort(),
        );
        assert.deepEqual(audits, [1], 'a new version started in Saving skips the audit');
        assert.notDeepEqual(await cuts(next.id), firstCuts);
        const [a, b] = workers.map((w) => JSON.parse(w.text));
        assert.deepEqual(
            { ...b, differentVersion: undefined, instruction: undefined, currentPlan: undefined },
            { ...a, differentVersion: undefined, instruction: undefined, currentPlan: undefined },
            'same frozen request and selection',
        );
        assert.equal(b.differentVersion, true);
        assert.deepEqual(b.currentPlan, firstPlan, 'plans from the current version');
        assert.equal(a.currentPlan, undefined);
        assert.equal(b.instruction, 'Slower pace');
        assert.ok(!workers[1].tree.instructions.includes(b.instruction));
        assert.doesNotMatch(workers[1].text, /UNTRUSTED/);
        assert.equal(workers[1].tree.thread, null);
        // Previous version swaps the whole video back, cuts and all, with no new job; the library keeps both.
        const chat = async () =>
            (await (await env.get(`/api/trees/${tree.id}`)).json()).artifacts.map((v) => [
                v.id,
                v.status,
                v.hasPrevious,
            ]);
        assert.deepEqual(await chat(), [[next.id, 'ready', true]]);
        const back = await (
            await env.post(`/api/trees/${tree.id}/artifacts/${next.id}/previous`)
        ).json();
        assert.deepEqual(
            [back.id, back.status, back.title, back.exported],
            [first.id, 'ready', first.title, true],
        );
        assert.deepEqual(await chat(), [[first.id, 'ready', true]]);
        assert.deepEqual(JSON.parse(env.store.artifact(tree.id, first.id).input), a);
        assert.deepEqual(await cuts(first.id), firstCuts);
        assert.deepEqual(await bytes(`${artifactUrl(first.id)}/cuts/0/narration`), firstAudio);
        assert.deepEqual(await bytes(`${artifactUrl(first.id)}/media`), mp4);
        assert.equal(
            (await (await env.post(`/api/trees/${tree.id}/artifacts/${first.id}/previous`)).json())
                .id,
            next.id,
        );
        assert.equal(
            JSON.parse(env.store.artifact(tree.id, next.id).input).instruction,
            b.instruction,
        );
        assert.equal(workers.length, 2, 'switching redraws nothing');
        assert.deepEqual(
            (await (await env.get('/api/videos')).json()).videos.map((v) => v.id).sort(),
            [first.id, next.id].sort(),
        );
        // Generating again after a switch builds on the video the learner chose.
        assert.equal((await env.post(`${artifactUrl(next.id)}/previous`)).status, 200);
        const third = await (await env.post(`${artifactUrl(first.id)}/regenerate`)).json();
        await until(() => workers.length === 3);
        const c = JSON.parse(workers[2].text);
        assert.deepEqual(c.currentPlan, firstPlan);
        assert.equal(c.instruction, undefined);
        const alternative = /\b(?:different|alternative|another)\b[^.!?\n]*\b(?:approach|take)\b/i;
        assert.match(workers[2].tree.instructions, alternative);
        assert.doesNotMatch(workers[1].tree.instructions, alternative);
        assert.equal((await env.post(`${artifactUrl(third.id)}/previous`)).status, 409);
        assert.equal((await env.post(`${artifactUrl(third.id)}/cancel`)).status, 200);
        release();
        assert.equal((await env.post(`${artifactUrl(third.id)}/previous`)).status, 200);
        assert.deepEqual(await chat(), [[first.id, 'ready', undefined]]);
        assert.deepEqual(await bytes(`${artifactUrl(first.id)}/cuts/0/narration`), firstAudio);
        assert.deepEqual(await bytes(`${artifactUrl(first.id)}/media`), mp4);
        assert.equal(workers.length, 3, 'restoring a canceled version redraws nothing');
    } finally {
        release?.();
        env.close();
    }
});
