import { test } from 'node:test';
import assert from 'node:assert/strict';
import { basename, join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { block as visualBlock } from '../support/visual-kit.mjs';
import { MANIM_INSTRUCTIONS } from '../../server/media/manim-cut.mjs';
import { CUT_INSTRUCTIONS } from '../../server/media/video-cut.mjs';
import { ENGINES } from '../../server/media/cut-engines.mjs';
import {
    open,
    complete,
    composition,
    manimCut,
    planFor,
    directive,
    fakeRender,
    until,
    fixerTask,
    repairAnswer,
    planText,
    job,
} from '../support/video-kit.mjs';

test('Python cut validation accepts kit math and rejects imports and off-brief styles without executing scenes', () => {
    const result = spawnSync('python3', ['-I', 'test/media/manim-validation.py'], {
        encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
});

test('a fake engine stands in for either kind of cut', async () => {
    const plan = planFor(composition, 2);
    plan.cuts[1].engine = 'manim';
    const asked = [];
    const fake = (kind, clip) => ({
        ...ENGINES[kind],
        ready: () => asked.push(`${kind} ready`),
        check: async () => asked.push(`${kind} check`),
        play: async () => (asked.push(`${kind} play`), clip),
        // Writes no stills, so the audit is skipped.
        stills: async () => asked.push(`${kind} stills`),
    });
    const { result, row } = await job(null, null, composition, 2, {
        plan,
        engines: { remotion: fake('remotion', null), manim: fake('manim', 'public/fake.mp4') },
    });
    assert.equal(result, null);
    assert.equal(row.status, 'ready');
    assert.deepEqual(
        JSON.parse(row.source).cuts.map((c) => c.clip),
        [undefined, 'cut-1/public/fake.mp4'],
    );
    assert.deepEqual(asked.sort(), [
        'manim check',
        'manim play',
        'manim ready',
        'manim stills',
        'remotion check',
        'remotion ready',
        'remotion stills',
    ]);
});

for (const repair of [false, true])
    test(`mixed-engine plan places a rendered Manim clip between Remotion cuts${repair ? ' and repairs only math' : ''}`, async (t) => {
        const plan = planFor(composition, 3);
        plan.cuts[1].engine = 'manim';
        const writes = [0, 0, 0],
            renders = [],
            warnings = [];
        let math = 0;
        const env = await open(
            {
                generate: async (tree, text, emit) => {
                    if (tree.id) return complete(emit, 'Watch.' + directive);
                    emit({ type: 'usage', usage: { input: 3, output: 5, cacheRead: 0 } });
                    if (tree.instructions.startsWith('You plan')) {
                        return complete(emit, planText(plan));
                    }
                    const input = fixerTask(text),
                        index = plan.cuts.findIndex((c) => c.purpose === input.cut.purpose);
                    writes[index]++;
                    if (index === 1) {
                        assert.ok(tree.instructions.includes(MANIM_INSTRUCTIONS));
                        assert.deepEqual(input.styleBrief, plan.styleBrief);
                        assert.equal(input.previousEndState, plan.cuts[0].endState);
                        if (writes[index] > 1) assert.ok(input.validationError);
                    } else assert.ok(tree.instructions.includes(CUT_INSTRUCTIONS));
                    complete(
                        emit,
                        repairAnswer(
                            tree,
                            text,
                            index === 1 ? '```python\n' + manimCut + '\n```' : composition,
                        ),
                    );
                },
            },
            {
                log: (message) => warnings.push(message),
                videoManim: {
                    detect: () => ({ ready: true, python: 'fake-python' }),
                    render: async (ws, out) => {
                        math++;
                        assert.equal(basename(ws), 'cut-1');
                        assert.equal(readFileSync(join(ws, 'Cut.py'), 'utf8'), manimCut.trim());
                        assert.ok(!existsSync(join(ws, 'public/manim.mp4')));
                        const brief = JSON.parse(readFileSync(join(ws, 'brief.json')));
                        assert.equal(brief.colors.winner, '#dfae4e');
                        assert.ok(!('leaf' in brief.palette));
                        if (repair && math === 1) throw new Error('Invalid math cut fixture.');
                        return fakeRender(ws, out);
                    },
                },
                videoRender: async (ws) => renders.push(basename(ws)),
            },
        );
        t.after(async () => {
            await env.app.stop();
            env.store.close();
        });
        const tree = env.store.create('Mixed math', 'codex');
        await (
            await env.post(`/api/trees/${tree.id}/messages`, { text: 'Make a math video.' })
        ).text();
        const row = await until(() =>
            env.store.tree(tree.id).artifacts.find((a) => ['ready', 'failed'].includes(a.status)),
        );
        assert.equal(row.status, 'ready', row.error);
        const { cuts } = JSON.parse(row.source);
        assert.deepEqual(
            cuts.map((c) => c.engine),
            ['remotion', 'manim', 'remotion'],
        );
        assert.deepEqual(
            cuts.map((c) => c.status),
            ['written', 'written', 'written'],
        );
        assert.equal(cuts[1].clip, 'cut-1/public/manim.mp4');
        assert.equal(cuts[1].timing.durationInFrames, 75);
        assert.equal(row.duration, 7.5);
        assert.deepEqual(writes, repair ? [1, 2, 1] : [1, 1, 1]);
        assert.equal(math, repair ? 2 : 1);
        assert.equal(
            env.store.usageEvents().events.filter((e) => e.task === 'video').length,
            repair ? 5 : 4,
        );
        // Saving renders no MP4; the Manim clip is kept for live playback.
        assert.deepEqual(renders, []);
        assert.ok(
            existsSync(join(env.dir, 'video-work', row.id, row.attempt, 'cut-1/public/manim.mp4')),
        );
        assert.deepEqual(
            warnings.filter((line) => line.includes(' WARN media ')),
            [],
        );
        const visible = await (await env.get(`/api/trees/${tree.id}`)).text();
        assert.ok(!visible.includes('HouseScene') && !visible.includes('manim.mp4'));
    });

for (const broken of ['detect', 'runtime'])
    test(`unusable Manim (${broken}) fails clearly with one warning; chat and visuals keep working`, async (t) => {
        const plan = planFor();
        plan.cuts[0].engine = 'manim';
        const error = 'Manim unavailable: fixture missing dependency. Run npm start to repair.';
        const logs = [];
        let calls = 0,
            renders = 0;
        const env = await open(
            {
                generate: async (tree, text, emit) => {
                    if (tree.id)
                        return complete(
                            emit,
                            text === 'Make a video.'
                                ? directive
                                : text === 'Draw visual.'
                                  ? visualBlock()
                                  : 'Chat still works.',
                        );
                    if (tree.instructions.startsWith('You plan'))
                        return complete(emit, planText(plan));
                    if (tree.instructions.includes('Python source')) {
                        calls++;
                        return complete(emit, manimCut);
                    }
                    complete(
                        emit,
                        '<svg viewBox="0 0 80 80"><text x="5" y="40">Works</text></svg>',
                    );
                },
            },
            {
                log: (message) => logs.push(message),
                videoManim: {
                    detect: () => ({ ready: broken !== 'detect', error }),
                    render: async () => {
                        renders++;
                        throw Object.assign(new Error(error), { manimUnavailable: true });
                    },
                },
            },
        );
        t.after(async () => {
            await env.app.stop();
            env.store.close();
        });
        const tree = env.store.create('Unavailable', 'codex');
        await (await env.post(`/api/trees/${tree.id}/messages`, { text: 'Make a video.' })).text();
        const row = await until(() =>
            env.store.tree(tree.id).artifacts.find((a) => a.status === 'failed'),
        );
        assert.equal(row.error, error);
        const warnings = logs.filter((line) => line.includes(' WARN media '));
        assert.equal(warnings.length, 1);
        assert.ok(warnings[0].includes(error));
        assert.match(warnings[0], /next=/);
        assert.ok(logs.some((line) => line.includes(' ERROR media failed ')));
        assert.equal(calls, broken === 'detect' ? 0 : 1);
        assert.equal(renders, broken === 'detect' ? 0 : 1);
        assert.equal(
            (await env.get(`/api/trees/${tree.id}/artifacts/${row.id}/media`)).status,
            404,
        );
        await (
            await env.post(`/api/trees/${tree.id}/messages`, { text: 'Continue learning.' })
        ).text();
        assert.equal(env.store.tree(tree.id).messages.at(-1).text, 'Chat still works.');
        await (await env.post(`/api/trees/${tree.id}/messages`, { text: 'Draw visual.' })).text();
        const ready = await until(() =>
            env.store
                .tree(tree.id)
                .artifacts.find((a) => a.kind === 'visual' && a.status === 'ready'),
        );
        assert.match(ready.source, /Works/);
    });

for (const invalid of [false, true])
    test(`a ${invalid ? 'invalid Manim cut is repaired at write time' : 'valid Manim cut is checked once'} before any render`, async (t) => {
        const plan = planFor(composition, 2);
        plan.cuts[1].engine = 'manim';
        const bad = manimCut.replace('colors["winner"]', 'RED');
        const inputs = [],
            events = [];
        const env = await open(
            {
                generate: async (tree, text, emit) => {
                    if (tree.id) return complete(emit, 'Watch.' + directive);
                    if (tree.instructions.startsWith('You plan'))
                        return complete(emit, planText(plan));
                    if (!tree.instructions.includes('Python source'))
                        return complete(emit, composition);
                    inputs.push(fixerTask(text));
                    complete(
                        emit,
                        repairAnswer(tree, text, invalid && inputs.length === 1 ? bad : manimCut),
                    );
                },
            },
            {
                videoManim: {
                    detect: () => ({ ready: true, python: 'fake-python' }),
                    // The real check-only entry point, run without the sandbox.
                    check: async (ws) => {
                        events.push('check');
                        const result = spawnSync(
                            'python3',
                            [
                                '-I',
                                '-B',
                                join(process.cwd(), 'server/media/manim-render.py'),
                                '--check',
                            ],
                            { cwd: ws, encoding: 'utf8' },
                        );
                        const answer = JSON.parse(result.stdout.trim().split('\n').at(-1));
                        if (answer.error) throw new Error(answer.error);
                    },
                    render: async (ws, out) => {
                        events.push('render');
                        assert.equal(readFileSync(join(ws, 'Cut.py'), 'utf8'), manimCut.trim());
                        return fakeRender(ws, out);
                    },
                },
            },
        );
        t.after(async () => {
            await env.app.stop();
            env.store.close();
        });
        const tree = env.store.create('Checked math', 'codex');
        await (
            await env.post(`/api/trees/${tree.id}/messages`, { text: 'Make a math video.' })
        ).text();
        const row = await until(() =>
            env.store.tree(tree.id).artifacts.find((a) => ['ready', 'failed'].includes(a.status)),
        );
        assert.equal(row.status, 'ready', row.error);
        assert.deepEqual(events, invalid ? ['check', 'check', 'render'] : ['check', 'render']);
        assert.equal(inputs.length, invalid ? 2 : 1);
        assert.equal(inputs[0].validationError, undefined);
        if (invalid) assert.match(inputs[1].validationError, /RED/);
    });
