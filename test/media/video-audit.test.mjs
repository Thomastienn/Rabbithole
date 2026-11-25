import { test } from 'node:test';
import assert from 'node:assert/strict';
import { basename, join } from 'node:path';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import {
    planFor,
    composition,
    directive,
    complete,
    until,
    open,
    job,
    fakeRender,
    asksPatch,
    fixerTask,
    patchOf,
    repairAnswer,
    audit,
    pass,
    problems,
    planText,
    themed,
} from '../support/video-kit.mjs';
import { auditFix, auditReport } from '../../server/media/audit-answers.mjs';
import { ENGINES } from '../../server/media/cut-engines.mjs';

const twoCuts = () => {
    const plan = planFor(composition, 2);
    plan.cuts.forEach((c, i) => {
        c.narration = `Narration ${i}.`;
    });
    return plan;
};
const cutOf = (plan, text) => plan.cuts.findIndex((c) => c.purpose === fixerTask(text).cut.purpose);
const written = (i) => composition.replace('PRIVATE_SOURCE_MARKER', `CUT_${i}`);
const fixed = composition.replace('PRIVATE_SOURCE_MARKER', 'AUDITED');
const moved = [{ tool: 'cursor', sentence: 0, x: 700, y: 300 }];
const issues = [{ what: 'Label overlaps the box', where: 'sentence 1, centre' }];
// Stills record the staged code they were taken from.
const stills = (shots) => async (dir, list) => {
    shots.push([basename(dir), readFileSync(join(dir, 'Video.tsx'), 'utf8'), list]);
    for (const { file } of list) writeFileSync(file, 'jpeg');
};
const running = async (env, text = 'Make a video.') => {
    const chat = env.store.create('Audit', 'codex');
    await (await env.post(`/api/trees/${chat.id}/messages`, { text })).text();
    return chat;
};
// A later call can start after Cancel with the signal already aborted, like the real sandbox.
const aborted = (signal) =>
    signal.aborted || new Promise((resolve) => signal.addEventListener('abort', resolve));
const settledRow = (env, chat) =>
    until(() =>
        env.store
            .tree(chat.id)
            .artifacts.find((a) => ['ready', 'failed', 'canceled'].includes(a.status)),
    );

test('audits start together, see code, stills and the previous last frame; issues get one chat-model fix whose moved marks replace the cut before it plays; ok makes no extra call; usage stages audit and fix', async (t) => {
    const plan = twoCuts();
    const audits = [],
        fixes = [],
        shots = [],
        logs = [];
    let chat, liveDuringAudit, phaseDuringAudit, rowsDuringFix;
    const env = await open(
        {
            generate: async (tree, text, emit) => {
                if (tree.id) return complete(emit, 'Watch.' + directive);
                if (tree.stage === 'plan') return complete(emit, planText(plan));
                const i = cutOf(plan, text);
                if (tree.stage === 'fix') {
                    fixes.push({ i, tree, text, input: fixerTask(text) });
                    const row = env.store.tree(chat.id).artifacts[0];
                    rowsDuringFix = (
                        await (await env.get(`/api/trees/${chat.id}/artifacts/${row.id}`)).json()
                    ).cutRows;
                    return complete(
                        emit,
                        JSON.stringify({ patch: patchOf(written(i), fixed), emphasis: moved }),
                    );
                }
                if (tree.stage !== 'audit') return complete(emit, written(i));
                audits.push({ i, input: JSON.parse(text), images: tree.images });
                // Both audits are in flight at once; sequential audits would never get here.
                await until(() => audits.length === 2);
                if (i === 0) {
                    const row = env.store.tree(chat.id).artifacts[0];
                    liveDuringAudit = await (
                        await env.get(`/api/trees/${chat.id}/artifacts/${row.id}/cuts`)
                    ).json();
                    phaseDuringAudit = (
                        await (await env.get(`/api/trees/${chat.id}/artifacts/${row.id}`)).json()
                    ).phase;
                    return audit(tree, emit, ...problems(issues));
                }
                await until(() => liveDuringAudit);
                audit(tree, emit, pass);
            },
        },
        {
            log: (line) => logs.push(line),
            videoSnapshot: stills(shots),
        },
    );
    t.after(async () => {
        await env.app.stop();
        env.store.close();
    });
    chat = await running(env);
    const row = await settledRow(env, chat);
    assert.equal(row.status, 'ready', row.error);
    assert.equal(phaseDuringAudit, 'auditing');
    // The flagged cut shows fixing; its sibling's ok audit already made it ready.
    assert.deepEqual(
        rowsDuringFix.map((r) => [r.cut, r.title, r.state]),
        [
            [1, plan.cuts[0].purpose, 'fixing'],
            [2, plan.cuts[1].purpose, 'ready'],
        ],
    );
    assert.deepEqual(
        liveDuringAudit.cuts.map((c) => [c.playable, c.code]),
        [
            [false, null],
            [false, null],
        ],
        'no cut plays before its audit settles',
    );
    const [first, second] = [0, 1].map((i) => audits.find((a) => a.i === i));
    assert.equal(first.input.code, written(0));
    assert.deepEqual(first.input.cut, plan.cuts[0]);
    assert.equal(first.input.previousEndState, null);
    assert.equal(second.input.previousEndState, plan.cuts[0].endState);
    assert.deepEqual(first.input.styleBrief, themed(plan).styleBrief);
    // A contact sheet, then one still per sentence end plus the last frame; fakeNarration's last sentence ends
    // before the audio does.
    assert.equal(first.images.length, 3);
    assert.equal(first.input.snapshots, 2);
    const [, , list] = shots.find(([dir]) => dir === 'cut-0');
    assert.equal(first.images[0].path, list[0].file);
    assert.equal(list[0].sheet, true, 'the first image is the contact sheet');
    assert.ok(list.slice(1).every((s) => !s.sheet && s.frame >= 0));
    assert.equal(second.images.length, 4, "cut 2 also sees cut 1's pre-audit last frame");
    assert.equal(second.input.previousLastFrame, true);
    assert.equal(second.images[3].path, first.images[2].path);
    assert.ok(second.images.every((img) => img.type === 'image/jpeg'));
    assert.deepEqual(
        shots
            .slice(0, 2)
            .map((s) => s[1])
            .sort(),
        [written(0), written(1)],
    );
    assert.ok(
        shots.some(([dir, code]) => dir === 'cut-0' && code === fixed),
        'fix is rendered',
    );
    const source = JSON.parse(row.source);
    assert.equal(source.cuts[0].code, fixed);
    assert.deepEqual(source.cuts[0].emphasis, moved);
    assert.equal(source.cuts[1].code, written(1));
    // The saved video plays live with the fix and its moved marks.
    const saved = await (await env.get(`/api/trees/${chat.id}/artifacts/${row.id}/cuts`)).json();
    assert.ok(saved.cuts.every((c) => c.playable));
    assert.deepEqual(saved.cuts[0].emphasis, moved, 'live player draws moved marks');
    // Only the flagged cut gets a fix: one chat-model rewrite carrying the issues, plan, set pieces and code.
    assert.equal(fixes.length, 1);
    assert.equal(fixes[0].i, 0);
    assert.deepEqual(fixes[0].input.issues, issues);
    assert.deepEqual(fixes[0].input.cut, plan.cuts[0]);
    assert.deepEqual(fixes[0].input.styleBrief, themed(plan).styleBrief);
    assert.equal(fixes[0].input.code, written(0));
    assert.ok(fixes[0].text.endsWith('\n\ncode:\n' + written(0)), 'the code follows as raw lines');
    assert.equal(fixes[0].input.previousLastFrame, false);
    assert.equal(fixes[0].tree.images, undefined);
    const stage = (name) =>
        logs.filter((l) => l.includes(' model finished ') && l.includes(`stage="${name}"`)).length;
    assert.equal(stage('audit'), 2);
    assert.equal(stage('fix'), 1);
    await env.app.settled();
    const dir = join(env.dir, 'video-work', row.id, row.attempt);
    assert.ok(!existsSync(join(dir, 'cut-0', 'out')), 'snapshots are removed');
});

test('a fix that breaks the check goes to a repair carrying the issues; one that breaks the render keeps the cut from before the audit', async (t) => {
    const plan = twoCuts();
    const shots = [],
        repairs = [];
    let fixCalls = 0;
    const env = await open(
        {
            generate: async (tree, text, emit) => {
                if (tree.id) return complete(emit, 'Watch.' + directive);
                if (tree.stage === 'plan') return complete(emit, planText(plan));
                const i = cutOf(plan, text);
                if (tree.stage === 'audit') return audit(tree, emit, ...problems(issues));
                if (tree.stage === 'repair' && asksPatch(text)) repairs.push([i, fixerTask(text)]);
                if (tree.stage !== 'fix')
                    return complete(emit, repairAnswer(tree, text, written(i)));
                fixCalls++;
                complete(
                    emit,
                    JSON.stringify({
                        patch: patchOf(
                            written(i),
                            i === 0
                                ? fixed.replace('fontSize: 40', "fontSize: 40, color: 'blue'")
                                : fixed.replace('AUDITED', 'BROKEN'),
                        ),
                        emphasis: moved,
                    }),
                );
            },
        },
        {
            videoSnapshot: async (dir, list, signal) => {
                if (readFileSync(join(dir, 'Video.tsx'), 'utf8').includes('BROKEN'))
                    throw new Error('Video rendering failed.');
                return stills(shots)(dir, list, signal);
            },
        },
    );
    t.after(async () => {
        await env.app.stop();
        env.store.close();
    });
    const chat = await running(env);
    const row = await settledRow(env, chat);
    assert.equal(row.status, 'ready', row.error);
    const saved = JSON.parse(row.source);
    assert.deepEqual(
        saved.cuts.map((c) => [c.code, c.emphasis]),
        [
            [written(0), undefined],
            [written(1), undefined],
        ],
    );
    assert.equal(fixCalls, 2, 'each flagged cut gets exactly one fix and no retry');
    // Only the fix that failed validation is repaired, from the cut before the audit.
    assert.deepEqual(
        repairs.map(([i, task]) => i),
        [0],
    );
    assert.equal(repairs[0][1].failedCode, written(0));
    assert.match(repairs[0][1].validationError, /Label overlaps the box/);
});

test('a fix patch that does not parse or apply goes to the repair attempts carrying the issues; no whole-source fix', async (t) => {
    const plan = twoCuts();
    const calls = [];
    const repaired = (i) => written(i).replace(`CUT_${i}`, `REPAIRED_${i}`);
    const env = await open(
        {
            generate: async (tree, text, emit) => {
                if (tree.id) return complete(emit, 'Watch.' + directive);
                if (tree.stage === 'plan') return complete(emit, planText(plan));
                const i = cutOf(plan, text);
                if (tree.stage === 'audit') return audit(tree, emit, ...problems(issues));
                if (tree.stage === 'fix') {
                    calls.push([i, 'fix']);
                    // Cut 0 answers a hunk whose context is not in the cut; cut 1 answers no diff at all.
                    return complete(
                        emit,
                        JSON.stringify({
                            patch: i ? 'move the label' : patchOf(fixed, written(i)),
                        }),
                    );
                }
                if (tree.stage === 'repair' && asksPatch(text)) {
                    const task = fixerTask(text);
                    calls.push([
                        i,
                        'repair',
                        task.failedCode,
                        /Label overlaps the box/.test(task.validationError),
                    ]);
                    return complete(emit, repairAnswer(tree, text, repaired(i)));
                }
                if (tree.stage === 'repair' && !asksPatch(text)) calls.push([i, 'whole']);
                complete(emit, written(i));
            },
        },
        { videoSnapshot: stills([]) },
    );
    t.after(async () => {
        await env.app.stop();
        env.store.close();
    });
    const row = await settledRow(env, await running(env));
    assert.equal(row.status, 'ready', row.error);
    assert.deepEqual(
        calls.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1])),
        [
            [0, 'fix'],
            [0, 'repair', written(0), true],
            [1, 'fix'],
            [1, 'repair', written(1), true],
        ],
    );
    assert.deepEqual(
        JSON.parse(row.source).cuts.map((c) => [c.code, c.audited]),
        [0, 1].map((i) => [repaired(i), true]),
    );
});

test('a failed fix patch on a cut out of repairs fails the cut', async (t) => {
    const plan = twoCuts();
    const invalid = composition.replace('fontSize: 40', "fontSize: 40, color: 'blue'");
    let fixes = 0;
    const env = await open(
        {
            generate: async (tree, text, emit) => {
                if (tree.id) return complete(emit, 'Watch.' + directive);
                if (tree.stage === 'plan') return complete(emit, planText(plan));
                const i = cutOf(plan, text);
                if (tree.stage === 'audit')
                    return audit(tree, emit, ...(i ? [pass] : problems(issues)));
                if (tree.stage === 'fix') {
                    fixes++;
                    return complete(emit, JSON.stringify({ patch: 'move the label' }));
                }
                // Cut 0's repairs never validate.
                complete(emit, tree.stage === 'repair' ? invalid : written(i));
            },
        },
        { videoSnapshot: stills([]) },
    );
    t.after(async () => {
        await env.app.stop();
        env.store.close();
    });
    const row = await settledRow(env, await running(env));
    assert.equal(row.status, 'failed');
    assert.match(row.error, /^Cut 1 of 2: /);
    assert.equal(fixes, 1);
});

test('cancel stops a running snapshot and a running audit', async (t) => {
    for (const during of ['snapshot', 'audit']) {
        const plan = twoCuts();
        let audits = 0,
            snapshotAborted = false,
            auditAborted = false,
            holding = false;
        const env = await open(
            {
                generate: async (tree, text, emit, _, signal) => {
                    if (tree.id) return complete(emit, 'Watch.' + directive);
                    if (tree.stage === 'plan') return complete(emit, planText(plan));
                    if (tree.stage !== 'audit') return complete(emit, written(cutOf(plan, text)));
                    audits++;
                    holding = true;
                    await aborted(signal);
                    auditAborted = true;
                },
            },
            {
                videoSnapshot: async (dir, list, signal) => {
                    if (during === 'snapshot') {
                        holding = true;
                        await aborted(signal);
                        snapshotAborted = true;
                        throw signal.reason;
                    }
                    for (const { file } of list) writeFileSync(file, 'jpeg');
                },
            },
        );
        t.after(() => env.close());
        const chat = await running(env);
        await until(() => holding);
        const id = env.store.tree(chat.id).artifacts[0].id;
        await env.post(`/api/trees/${chat.id}/artifacts/${id}/cancel`);
        await env.app.settled();
        const row = env.store.artifact(chat.id, id);
        assert.equal(row.status, 'canceled', during);
        assert.equal((await env.get(`/api/trees/${chat.id}/artifacts/${id}/media`)).status, 404);
        if (during === 'snapshot') assert.ok(snapshotAborted && audits === 0);
        else assert.ok(auditAborted && audits >= 1);
        await env.app.stop();
        env.store.close();
    }
    t.diagnostic('both cancel points checked');
});

test('phases advance through auditing before playable; an unusable audit answer keeps the cut', async () => {
    const phases = [];
    const {
        result,
        row,
        phases: seen,
    } = await job(fakeRender, null, composition, 2, {
        snapshot: async (dir, list) => {
            for (const { file } of list) writeFileSync(file, 'jpeg');
        },
    });
    phases.push(...seen.map(([p]) => p));
    assert.equal(result, null);
    assert.equal(row.status, 'ready');
    // The job's provider answers audits with cut source, which is not an audit answer.
    assert.ok(JSON.parse(row.source).cuts.every((c) => c.code === composition && c.audited));
    const order = ['planning', 'writing', 'narrating', 'auditing', 'playable', 'saving'];
    const firsts = order.map((p) => phases.indexOf(p)).filter((i) => i >= 0);
    assert.ok(phases.includes('auditing'));
    assert.deepEqual(
        firsts,
        [...firsts].sort((a, b) => a - b),
        phases.join(' '),
    );
    assert.ok(phases.lastIndexOf('auditing') < phases.indexOf('playable'));
});

test('audit calls assemble into ok or issues, each bad call gets an error naming its field; fix answers to a validated fix', () => {
    const { styleBrief } = planFor();
    const passed = auditReport([]);
    passed.run('pass_cut', {});
    assert.equal(passed.issues(), null);
    // A problem outranks a pass; text-mode calls read the same as native ones.
    const flagging = auditReport(['Winner']);
    flagging.read(
        '<tool_call>{"name":"pass_cut","arguments":{}}</tool_call>' +
            `<tool_call>{"name":"flag_problem","arguments":${JSON.stringify({ cut: issues[0].where, problem: issues[0].what })}}</tool_call>` +
            '<tool_call>{"name":"flag_poor_piece","arguments":"{\\"piece\\":\\"Winner\\",\\"reason\\":\\"Flat\\"}"}</tool_call>',
    );
    assert.deepEqual(flagging.issues(), issues);
    assert.deepEqual(flagging.pieces, [{ name: 'Winner', why: 'Flat' }]);
    assert.throws(() => auditReport([]).issues(), /no verdict/);
    const checked = auditReport(['Winner']);
    assert.throws(() => checked.run('flag_problem', { problem: 'x' }), /^Error: cut/);
    assert.throws(() => checked.run('flag_problem', { cut: 'x', problem: ' ' }), /^Error: problem/);
    assert.throws(() => checked.run('flag_poor_piece', { piece: 'Other', reason: 'x' }), /Winner/);
    assert.throws(() => checked.run('flag_poor_piece', { piece: 'Winner' }), /^Error: reason/);
    for (let i = 0; i < 8; i++) checked.run('flag_problem', { cut: 'x', problem: 'y' });
    assert.throws(() => checked.run('flag_problem', { cut: 'x', problem: 'y' }), /At most 8/);
    // A cut without library pieces is offered no flag_poor_piece.
    assert.deepEqual(
        auditReport([]).tools.map((t) => t.name),
        ['flag_problem', 'pass_cut'],
    );
    // Against a source, a patch answer applies; one that does not parse or apply throws.
    const source = written(0);
    assert.deepEqual(
        auditFix(
            JSON.stringify({ patch: patchOf(source, fixed) }),
            styleBrief,
            1,
            ENGINES.remotion,
            source,
        ),
        { code: fixed },
    );
    assert.deepEqual(
        auditFix(
            JSON.stringify({ patch: patchOf(source, fixed), emphasis: moved }),
            styleBrief,
            1,
            ENGINES.remotion,
            source,
        ),
        { code: fixed, emphasis: moved },
    );
    for (const bad of [fixed, '{"code":"x"}', JSON.stringify({ patch: patchOf(fixed, source) })])
        assert.throws(() => auditFix(bad, styleBrief, 1, ENGINES.remotion, source));
    assert.throws(() =>
        auditFix(
            JSON.stringify({ patch: patchOf(source, fixed), emphasis: moved }),
            styleBrief,
            0,
            ENGINES.remotion,
            source,
        ),
    );
});
