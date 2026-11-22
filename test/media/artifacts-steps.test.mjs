import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../../server/store.mjs';
import { task, directive, source, complete, open } from '../support/diagram-kit.mjs';

test('a complex reply becomes several small ordered diagram steps; each worker gets one task and unsafe or invalid steps fail alone', async () => {
    const steps = ['Seeds', 'Sprouts', 'Bad step', 'Trees'].map((title, i) => ({
        title,
        description: `Step ${i + 1}: ${title.toLowerCase()} in words.`,
        intent: `Show ${title}.`,
        excerpt: 'Plants grow in stages.',
    }));
    const blocks =
        steps.map((step) => '\n```rabbithole-diagram\n' + JSON.stringify(step) + '\n```').join('') +
        '\n```rabbithole-diagram\n{broken}\n```';
    const workers = [];
    const env = await open({
        generate: async (tree, text, emit) => {
            if (tree.id)
                return complete(emit, 'Plants grow: a seed absorbs water, then sprouts.' + blocks);
            workers.push({ instructions: tree.instructions, task: JSON.parse(text) });
            const title = JSON.parse(text).title;
            complete(
                emit,
                title === 'Bad step'
                    ? 'flowchart TD\n A[Seed] --> B[Sprout]\n style A fill:#f00'
                    : `flowchart LR\n A["${title} start"]:::yellow -->|grows into| B[${title} end]\n class B green`,
            );
        },
    });
    try {
        const tree = env.store.create('Steps', 'codex');
        const stream = await (
            await env.post(`/api/trees/${tree.id}/messages`, { text: 'How do plants grow?' })
        ).text();
        assert.doesNotMatch(stream, /rabbithole-diagram|broken/);
        const saved = env.store.tree(tree.id);
        assert.equal(
            saved.messages.at(-1).text,
            'Plants grow: a seed absorbs water, then sprouts.',
        );
        assert.deepEqual(
            saved.artifacts.map((a) => [a.title, a.status]),
            [
                ['Seeds', 'ready'],
                ['Sprouts', 'ready'],
                ['Bad step', 'failed'],
                ['Trees', 'ready'],
                ['Diagram', 'failed'],
            ],
        );
        assert.deepEqual(
            saved.artifacts.slice(0, 4).map((a) => a.description),
            steps.map((s) => s.description),
            'each step keeps its own text alternative',
        );
        assert.match(saved.artifacts[2].error, /Unsafe diagram source/);
        assert.match(
            saved.artifacts[4].error,
            /Diagram request could not be read: the request was not valid JSON/,
        );
        assert.match(
            saved.artifacts[0].source,
            /A\["Seeds start"\]:::yellow/,
            'trusted classes are kept without generated styles',
        );
        assert.deepEqual(
            workers.map((w) => w.task),
            steps,
            'one isolated worker call per valid step, in reply order',
        );
        for (const w of workers)
            assert.match(
                w.instructions,
                /one main idea[\s\S]*yellow, blue, pink and green[\s\S]*never be the only cue/,
            );
        const pending = stream
            .split('\n\n')
            .filter((f) => f.includes('"type":"artifact"'))
            .map((f) => JSON.parse(f.slice(6)).artifact);
        assert.deepEqual(
            pending.slice(0, 5).map((a) => a.status),
            ['pending', 'pending', 'pending', 'pending', 'failed'],
            'all step cards appear before workers run; rejected requests fail immediately',
        );
        const { tutorContext } = await import('../../server/media/tutor-context.mjs');
        const { TUTOR_RULES } = await import('../../server/media/tutor-instructions.mjs');
        assert.match(
            TUTOR_RULES,
            /several small visual steps[\s\S]*text stays accurate[\s\S]*text alternative/,
        );
        assert.doesNotMatch(
            JSON.stringify(tutorContext(saved).messages.at(-1)),
            /flowchart|Bad step/,
        );
        assert.match(tutorContext(saved).messages.at(-1).text, /Seeds[\s\S]*Sprouts[\s\S]*Trees/);
    } finally {
        env.close();
    }
});

test('Stop keeps completed steps, fails active and queued steps, and never starts the next worker or publishes late output', async () => {
    const steps = ['Ready', 'Running', 'Queued'].map((title) => ({ ...task, title }));
    const blocks = steps
        .map((step) => '\n```rabbithole-diagram\n' + JSON.stringify(step) + '\n```')
        .join('');
    const workers = [];
    let release, lateEmit, workerSignal, started;
    const pending = new Promise((resolve) => {
        started = resolve;
    });
    const env = await open({
        generate: async (tree, text, emit, save, signal) => {
            if (tree.id) return complete(emit, 'An explanation stays available.' + blocks);
            const { title } = JSON.parse(text);
            workers.push(title);
            if (title === 'Ready') return complete(emit, source);
            lateEmit = emit;
            workerSignal = signal;
            started();
            await new Promise((resolve) => {
                release = resolve;
            });
        },
    });
    try {
        const tree = env.store.create('Stop steps', 'codex');
        const stream = env
            .post(`/api/trees/${tree.id}/messages`, { text: 'Explain in steps.' })
            .then((r) => r.text());
        await pending;
        assert.deepEqual(
            env.store.tree(tree.id).artifacts.map((a) => a.status),
            ['ready', 'pending', 'pending'],
        );
        assert.equal((await env.post(`/api/trees/${tree.id}/stop`)).status, 200);
        await stream;
        const saved = env.store.tree(tree.id);
        assert.equal(workerSignal.aborted, true);
        assert.deepEqual(workers, ['Ready', 'Running']);
        assert.deepEqual(
            saved.artifacts.map((a) => a.status),
            ['ready', 'failed', 'failed'],
        );
        assert.equal(saved.artifacts[0].source, source);
        assert.ok(
            saved.artifacts.slice(1).every((a) => a.source === null && /cancelled/.test(a.error)),
        );
        assert.equal(saved.messages.at(-1).text, 'An explanation stays available.');
        assert.equal(saved.messages.at(-1).status, 'interrupted');
        complete(lateEmit, source);
        release();
        await new Promise((resolve) => setImmediate(resolve));
        assert.deepEqual(env.store.tree(tree.id), saved);
        const restored = new Store(env.path);
        try {
            assert.deepEqual(
                restored.tree(tree.id),
                saved,
                'step order and terminal states survive reopening',
            );
        } finally {
            restored.close();
        }
    } finally {
        release?.();
        env.close();
    }
});

test('artifact reads and message attachments enforce exact conversation ownership', async () => {
    const env = await open({
        generate: async (tree, text, emit) =>
            complete(emit, tree.id ? 'Rounds advance.' + directive : source),
    });
    try {
        const owner = env.store.create('Owner', 'codex'),
            other = env.store.create('Other', 'codex');
        await (await env.post(`/api/trees/${owner.id}/messages`, { text: 'Diagram.' })).text();
        const saved = env.store.tree(owner.id),
            artifact = saved.artifacts[0];
        assert.equal(
            (await env.get(`/api/trees/${owner.id}/artifacts/${artifact.id}`)).status,
            200,
        );
        assert.equal(
            (await env.get(`/api/trees/${other.id}/artifacts/${artifact.id}`)).status,
            404,
        );
        assert.equal((await env.get(`/api/artifacts/${artifact.id}`)).status, 404);
        assert.deepEqual((await (await env.get(`/api/trees/${other.id}`)).json()).artifacts, []);
        for (const key of ['artifactId', 'artifactIds', 'artifacts']) {
            assert.equal(
                (
                    await env.post(`/api/trees/${other.id}/messages`, {
                        text: 'Attach.',
                        [key]: key === 'artifactId' ? artifact.id : [artifact.id],
                    })
                ).status,
                400,
            );
        }
        assert.equal(
            (
                await env.post(`/api/trees/${other.id}/artifacts`, {
                    id: artifact.id,
                    message: saved.messages.at(-1).id,
                })
            ).status,
            404,
        );
        assert.throws(
            () => env.store.pendingArtifact(other.id, artifact.message, 'Foreign', 'Should fail'),
            /does not belong/,
        );
        assert.equal(env.store.finishArtifact(other.id, artifact.id, source), undefined);
        assert.equal(env.store.tree(other.id).messages.length, 0);
        assert.deepEqual(env.store.artifact(owner.id, artifact.id), artifact);
    } finally {
        env.close();
    }
});

test('provider switches and branch compaction receive ready metadata only, with no failed artifact or generation work', async () => {
    const calls = [];
    const fake = (name) => ({
        models: async () => [{ model: name + '-model', isDefault: true }],
        generate: async (tree, text, emit, save) => {
            calls.push({ name, tree, text });
            if (!tree.id)
                complete(
                    emit,
                    tree.role === 'compaction' ? 'The tournament diagram shows rounds.' : source,
                );
            else {
                save(name + '-tutor-thread', name + '-model');
                complete(
                    emit,
                    text === 'Draw.' ? 'Rounds advance.' + directive : 'More about rounds.',
                );
            }
        },
    });
    const env = await open(null, {
        providers: { claude: fake('claude'), codex: fake('codex') },
        defaultProvider: 'claude',
    });
    try {
        const tree = await (await env.post('/api/trees')).json();
        await (await env.post(`/api/trees/${tree.id}/messages`, { text: 'Draw.' })).text();
        let saved = env.store.tree(tree.id);
        const [artifact] = saved.artifacts;
        const failed = env.store.pendingArtifact(
            tree.id,
            artifact.message,
            'FAILED PRIVATE TITLE',
            'FAILED PRIVATE DESCRIPTION',
        );
        env.store.finishArtifact(tree.id, failed.id, null, 'Failed worker detail.');
        for (const name of ['codex', 'claude']) {
            assert.equal(
                (
                    await env.post(`/api/trees/${tree.id}/model`, {
                        provider: name,
                        model: name + '-model',
                    })
                ).status,
                200,
            );
            await (await env.post(`/api/trees/${tree.id}/messages`, { text: 'Continue.' })).text();
            const call = calls.at(-1);
            assert.equal(call.tree.thread, null);
            assert.match(JSON.stringify(call.tree.messages), /Tournament tree|Pairs of winners/);
            assert.doesNotMatch(
                JSON.stringify(call),
                /flowchart|Winner A|Show two winners|A and B advance|FAILED PRIVATE|Failed worker detail/,
            );
            assert.equal(call.tree.artifacts, undefined);
        }
        saved = env.store.tree(tree.id);
        const messageId = saved.messages[1].id;
        const response = await env.post(`/api/trees/${tree.id}/branches`, {
            messageId,
            start: 0,
            end: 6,
            text: 'Rounds',
            question: 'Why rounds?',
        });
        assert.equal(response.status, 201);
        const compaction = calls.at(-1);
        assert.equal(compaction.tree.thread, null);
        assert.match(compaction.text, /Tournament tree|Pairs of winners/);
        assert.ok(
            compaction.text.includes(
                '[Diagram: Tournament tree — Pairs of winners advance to the root.]',
            ),
        );
        assert.doesNotMatch(
            compaction.text,
            /flowchart|Winner A|Show two winners|A and B advance|FAILED PRIVATE|Failed worker detail/,
        );
        const child = await response.json();
        assert.deepEqual(child.artifacts, []);
        assert.equal(
            (await env.get(`/api/trees/${child.id}/artifacts/${artifact.id}`)).status,
            404,
        );
    } finally {
        env.close();
    }
});
