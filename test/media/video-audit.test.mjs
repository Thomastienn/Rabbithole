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
  fixerTask,
  patchOf,
} from '../support/video-kit.mjs';
import { AUDIT_INSTRUCTIONS, FIX_NOTE, FIX_WHOLE_NOTE } from '../../server/media/video-cut.mjs';
import { auditFix, auditIssues } from '../../server/media/video-cuts.mjs';

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
const flagged = JSON.stringify({ issues });
// Stills record the staged code they were taken from.
const stills = (shots) => async (dir, list) => {
  shots.push([basename(dir), readFileSync(join(dir, 'Video.tsx'), 'utf8'), list.length]);
  for (const { file } of list) writeFileSync(file, 'jpeg');
};
const running = async (env, text = 'Make a video.') => {
  const chat = env.store.create('Audit', 'codex');
  await (await env.post(`/api/trees/${chat.id}/messages`, { text })).text();
  return chat;
};
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
    logs = [],
    finalMarks = {};
  let chat, liveDuringAudit, phaseDuringAudit, liveAtRender;
  const env = await open(
    {
      generate: async (tree, text, emit) => {
        if (tree.id) return complete(emit, 'Watch.' + directive);
        if (tree.instructions.startsWith('You plan')) return complete(emit, JSON.stringify(plan));
        const i = cutOf(plan, text);
        if (tree.instructions.endsWith(FIX_NOTE)) {
          fixes.push({ i, tree, text, input: fixerTask(text) });
          return complete(
            emit,
            JSON.stringify({ patch: patchOf(written(i), fixed), emphasis: moved }),
          );
        }
        if (tree.instructions !== AUDIT_INSTRUCTIONS) return complete(emit, written(i));
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
          return complete(emit, flagged);
        }
        await until(() => liveDuringAudit);
        complete(emit, '{"ok":true}');
      },
    },
    {
      log: (line) => logs.push(line),
      videoSnapshot: stills(shots),
      videoRender: async (ws, out) => {
        if (/^cut-\d$/.test(basename(ws))) {
          finalMarks[basename(ws)] = [
            readFileSync(join(ws, 'Video.tsx'), 'utf8'),
            JSON.parse(readFileSync(join(ws, 'emphasis.json'), 'utf8')),
          ];
          const row = env.store.tree(chat.id).artifacts[0];
          liveAtRender ??= await (
            await env.get(`/api/trees/${chat.id}/artifacts/${row.id}/cuts`)
          ).json();
        }
        return fakeRender(ws, out);
      },
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
  assert.deepEqual(first.input.styleBrief, plan.styleBrief);
  // One still per sentence end plus the last frame; fakeNarration's last sentence ends before the audio does.
  assert.equal(first.images.length, 2);
  assert.equal(first.input.snapshots, 2);
  assert.equal(second.images.length, 3, "cut 2 also sees cut 1's pre-audit last frame");
  assert.equal(second.input.previousLastFrame, true);
  assert.equal(second.images[2].path, first.images[1].path);
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
  const saved = JSON.parse(row.source);
  assert.equal(saved.cuts[0].code, fixed);
  assert.deepEqual(saved.cuts[0].emphasis, moved);
  assert.equal(saved.cuts[1].code, written(1));
  assert.deepEqual(finalMarks['cut-0'], [fixed, moved], 'the MP4 uses the fix and moved marks');
  assert.deepEqual(liveAtRender.cuts[0].emphasis, moved, 'live player draws moved marks');
  // Only the flagged cut gets a fix: one chat-model rewrite carrying the issues, plan, set pieces and code.
  assert.equal(fixes.length, 1);
  assert.equal(fixes[0].i, 0);
  assert.deepEqual(fixes[0].input.issues, issues);
  assert.deepEqual(fixes[0].input.cut, plan.cuts[0]);
  assert.deepEqual(fixes[0].input.styleBrief, plan.styleBrief);
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

test('a fix that breaks the check or the render falls back to the cut from before the audit', async (t) => {
  const plan = twoCuts();
  const shots = [],
    final = {};
  let fixCalls = 0;
  const env = await open(
    {
      generate: async (tree, text, emit) => {
        if (tree.id) return complete(emit, 'Watch.' + directive);
        if (tree.instructions.startsWith('You plan')) return complete(emit, JSON.stringify(plan));
        const i = cutOf(plan, text);
        if (tree.instructions === AUDIT_INSTRUCTIONS) return complete(emit, flagged);
        if (!tree.instructions.endsWith(FIX_NOTE)) return complete(emit, written(i));
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
      videoRender: async (ws, out) => {
        if (/^cut-\d$/.test(basename(ws)))
          final[basename(ws)] = [
            readFileSync(join(ws, 'Video.tsx'), 'utf8'),
            JSON.parse(readFileSync(join(ws, 'emphasis.json'), 'utf8')),
          ];
        return fakeRender(ws, out);
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
  assert.deepEqual(final, { 'cut-0': [written(0), []], 'cut-1': [written(1), []] });
  assert.equal(fixCalls, 2, 'each flagged cut gets exactly one fix and no retry');
});

test('a fix patch that does not parse or apply gets exactly one whole-source call; no patch retry', async (t) => {
  const plan = twoCuts();
  const calls = [];
  const env = await open(
    {
      generate: async (tree, text, emit) => {
        if (tree.id) return complete(emit, 'Watch.' + directive);
        if (tree.instructions.startsWith('You plan')) return complete(emit, JSON.stringify(plan));
        const i = cutOf(plan, text);
        if (tree.instructions === AUDIT_INSTRUCTIONS) return complete(emit, flagged);
        if (tree.instructions.endsWith(FIX_NOTE)) {
          calls.push([i, 'patch']);
          // Cut 0 answers a hunk whose context is not in the cut; cut 1 answers no diff at all.
          return complete(
            emit,
            JSON.stringify({ patch: i ? 'move the label' : patchOf(fixed, written(i)) }),
          );
        }
        if (tree.instructions.endsWith(FIX_WHOLE_NOTE)) {
          calls.push([i, 'whole', JSON.parse(text).code]);
          return complete(
            emit,
            JSON.stringify({ code: written(i).replace(`CUT_${i}`, `WHOLE_${i}`) }),
          );
        }
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
      [0, 'patch'],
      [0, 'whole', written(0)],
      [1, 'patch'],
      [1, 'whole', written(1)],
    ],
  );
  assert.deepEqual(
    JSON.parse(row.source).cuts.map((c) => c.code),
    [0, 1].map((i) => written(i).replace(`CUT_${i}`, `WHOLE_${i}`)),
  );
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
          if (tree.instructions.startsWith('You plan')) return complete(emit, JSON.stringify(plan));
          if (tree.instructions !== AUDIT_INSTRUCTIONS)
            return complete(emit, written(cutOf(plan, text)));
          audits++;
          holding = true;
          await new Promise((resolve) => signal.addEventListener('abort', resolve));
          auditAborted = true;
        },
      },
      {
        videoSnapshot: async (dir, list, signal) => {
          if (during === 'snapshot') {
            holding = true;
            await new Promise((resolve) => signal.addEventListener('abort', resolve));
            snapshotAborted = true;
            throw signal.reason;
          }
          for (const { file } of list) writeFileSync(file, 'jpeg');
        },
      },
    );
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

test('audit answers parse to ok or issues, fix answers to a validated fix, anything else to an error', () => {
  const { styleBrief } = planFor();
  assert.equal(auditIssues('{"ok":true}'), null);
  assert.deepEqual(auditIssues('```json\n' + flagged + '\n```'), issues);
  for (const bad of [
    '{}',
    '{"issues":[]}',
    '{"issues":[{"what":"x"}]}',
    JSON.stringify({ code: fixed }),
    JSON.stringify({ issues: Array(9).fill(issues[0]) }),
    fixed,
  ])
    assert.throws(() => auditIssues(bad), bad.slice(0, 40));
  assert.deepEqual(auditFix(JSON.stringify({ code: fixed }), styleBrief, 1), { code: fixed });
  assert.deepEqual(auditFix(JSON.stringify({ code: fixed, emphasis: moved }), styleBrief, 1), {
    code: fixed,
    emphasis: moved,
  });
  assert.throws(() => auditFix(JSON.stringify({ code: fixed, emphasis: moved }), styleBrief, 0));
  assert.throws(() => auditFix(fixed, styleBrief, 1));
  assert.throws(() => auditFix('{"change":false}', styleBrief, 1));
  // Against a source, a patch answer applies; one that does not parse or apply is null for the fallback.
  const source = written(0);
  assert.deepEqual(
    auditFix(JSON.stringify({ patch: patchOf(source, fixed) }), styleBrief, 1, 'remotion', source),
    { code: fixed },
  );
  for (const bad of [fixed, '{"code":"x"}', JSON.stringify({ patch: patchOf(fixed, source) })])
    assert.equal(auditFix(bad, styleBrief, 1, 'remotion', source), null);
  assert.throws(() =>
    auditFix(
      JSON.stringify({ patch: patchOf(source, fixed), emphasis: moved }),
      styleBrief,
      0,
      'remotion',
      source,
    ),
  );
});
