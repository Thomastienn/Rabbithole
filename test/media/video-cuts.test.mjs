import { test } from 'node:test';
import assert from 'node:assert/strict';
import { basename, dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import {
  planFor,
  composition,
  directive,
  complete,
  until,
  open,
  fakeRender,
  fixerTask,
  repairAnswer,
} from '../support/video-kit.mjs';
import { fakeNarration } from '../support/fake-narration.mjs';
import { tutorContext } from '../../server/media/diagrams.mjs';
import {
  REMOTION_SKILL,
  REMOTION_3D_SKILL,
  MOTION_DESIGN_SKILL,
} from '../../server/media/skills.mjs';
import { CUT_3D } from '../../server/media/video-cut.mjs';
import { firstDiagnostic } from '../../server/media/video-sandbox.mjs';

const gate = () => Promise.withResolvers();

test('three cut writers and narrators start in parallel; reversed completions persist in plan order with measured pauses and per-call usage', async (t) => {
  const plan = planFor(composition, 3);
  plan.cuts.forEach((c, i) => {
    c.narration = `Narration ${i}`;
  });
  plan.cuts[1].join = 'continue';
  Object.assign(plan.cuts[2], {
    join: 'scene',
    transition: 'flip',
    direction: 'from-top',
    dimension: '3d',
    camera: 'slow orbit, then push in on the core',
  });
  const writers = plan.cuts.map(gate),
    voices = plan.cuts.map(gate);
  const writing = [],
    speaking = [],
    inputs = [],
    renders = [];
  let planning = 0;
  const env = await open(
    {
      generate: async (tree, text, emit) => {
        if (tree.id) return complete(emit, 'Watch.' + directive);
        emit({ type: 'usage', usage: { input: 10, output: 5, cacheRead: 2 } });
        if (tree.instructions.startsWith('You plan')) {
          planning++;
          return complete(emit, JSON.stringify(plan));
        }
        const input = fixerTask(text),
          i = plan.cuts.findIndex((c) => c.purpose === input.cut.purpose);
        inputs[i] = { tree, input };
        writing.push(i);
        await writers[i].promise;
        complete(emit, composition.replace('PRIVATE_SOURCE_MARKER', `CUT_${i}_PRIVATE`));
      },
    },
    {
      videoNarrate: async (script) => {
        const i = plan.cuts.findIndex((c) => c.narration === script);
        speaking.push(i);
        await voices[i].promise;
        return fakeNarration();
      },
      videoRender: async (ws, out) => {
        renders.push(ws);
        return fakeRender(ws, out);
      },
    },
  );
  t.after(async () => {
    await env.app.stop();
    env.store.close();
  });
  const tree = env.store.create('Cuts', 'codex');
  await (await env.post(`/api/trees/${tree.id}/messages`, { text: 'Make a video.' })).text();
  await until(() => writing.length === 3 && speaking.length === 3);
  assert.equal(
    renders.length,
    0,
    'all writers and narrators reach their gates without waiting for another cut',
  );
  assert.deepEqual([...writing].sort(), [0, 1, 2]);
  assert.deepEqual([...speaking].sort(), [0, 1, 2]);
  for (const i of [2, 1, 0]) {
    writers[i].resolve();
    voices[i].resolve();
  }
  const ready = await until(() =>
    env.store.tree(tree.id).artifacts.find((a) => a.status === 'ready'),
  );
  const data = JSON.parse(ready.source);
  assert.deepEqual(data.plan, plan);
  assert.deepEqual(
    data.cuts.map((c) => c.status),
    ['written', 'written', 'written'],
  );
  data.cuts.forEach((cut, i) => {
    assert.match(cut.code, new RegExp(`CUT_${i}_PRIVATE`));
    assert.equal(cut.engine, 'remotion');
    assert.equal(cut.timing.audioFrames, 60, 'ffprobe measured the fixture MP3');
    assert.equal(cut.timing.durationInFrames, 75);
    assert.deepEqual(
      [cut.timing.entry, cut.timing.exit],
      [
        [null, { join: 'continue' }],
        [{ join: 'continue' }, { join: 'scene', transition: 'flip', direction: 'from-top' }],
        [
          { join: 'scene', transition: 'flip', direction: 'from-top' },
          { join: 'scene', transition: 'fade' },
        ],
      ][i],
    );
    assert.deepEqual(inputs[i].input.styleBrief, plan.styleBrief);
    assert.deepEqual(inputs[i].input.cut, plan.cuts[i]);
    assert.equal(
      inputs[i].input.cut.camera,
      i === 2 ? 'slow orbit, then push in on the core' : undefined,
    );
    assert.equal(inputs[i].input.previousEndState, i ? plan.cuts[i - 1].endState : null);
    assert.equal(inputs[i].tree.thread, null);
    // Only the 3D cut's writer gets the 3D guidance.
    assert.equal(inputs[i].tree.instructions.includes(CUT_3D), i === 2);
    // Every Remotion writer gets the Remotion skill; only the 3D cut gets its 3D part.
    assert.ok(inputs[i].tree.instructions.includes(REMOTION_SKILL));
    assert.ok(inputs[i].tree.instructions.includes(MOTION_DESIGN_SKILL));
    assert.equal(inputs[i].tree.instructions.includes(REMOTION_3D_SKILL), i === 2);
    assert.ok(!('messages' in inputs[i].tree));
  });
  assert.equal(planning, 1);
  assert.equal(ready.duration, 7.5);
  assert.deepEqual(renders, [], 'saving renders no MP4');
  assert.equal(env.store.usageEvents().events.filter((e) => e.task === 'video').length, 4);
  for (const path of [
    `/api/trees/${tree.id}`,
    `/api/trees/${tree.id}/artifacts/${ready.id}`,
    `/api/previews?id=${tree.id}`,
  ]) {
    const visible = await (await env.get(path)).text();
    for (const secret of ['CUT_0_PRIVATE', 'styleBrief', 'Narration 0', 'previousEndState'])
      assert.ok(!visible.includes(secret));
  }
  assert.ok(!JSON.stringify(tutorContext(env.store.tree(tree.id))).includes('CUT_0_PRIVATE'));
});

for (const failure of ['brief', 'exhausted'])
  test(`${failure}: only the failed cut is rewritten within the repair budget`, async (t) => {
    const plan = planFor(composition, 3),
      writes = [0, 0, 0],
      repairs = [];
    let plans = 0,
      voices = 0;
    const env = await open(
      {
        generate: async (tree, text, emit) => {
          if (tree.id) return complete(emit, 'Watch.' + directive);
          emit({ type: 'usage', usage: { input: 2, output: 3, cacheRead: 0 } });
          if (tree.instructions.startsWith('You plan')) {
            plans++;
            return complete(emit, JSON.stringify(plan));
          }
          const input = fixerTask(text),
            i = plan.cuts.findIndex((c) => c.purpose === input.cut.purpose);
          writes[i]++;
          if (writes[i] > 1) repairs.push(input.validationError);
          complete(
            emit,
            repairAnswer(
              tree,
              text,
              i === 1 && (failure === 'exhausted' || (failure === 'brief' && writes[i] === 1))
                ? composition.replace('fontSize: 40', "fontSize: 40, color: 'blue'")
                : composition,
            ),
          );
        },
      },
      {
        videoNarrate: async () => {
          voices++;
          return fakeNarration();
        },
      },
    );
    t.after(async () => {
      await env.app.stop();
      env.store.close();
    });
    const tree = env.store.create('Repair', 'codex');
    await (await env.post(`/api/trees/${tree.id}/messages`, { text: 'Make a video.' })).text();
    const row = await until(() =>
      env.store.tree(tree.id).artifacts.find((a) => ['ready', 'failed'].includes(a.status)),
    );
    assert.equal(row.status, failure === 'exhausted' ? 'failed' : 'ready');
    assert.deepEqual(writes, [1, 2, 1]);
    assert.equal(repairs.length, 1);
    assert.ok(repairs[0]);
    if (failure === 'exhausted')
      assert.match(row.error, /^Cut 2 of 3: \S.*\. Retry keeps the other cuts\.$/);
    assert.ok(!JSON.stringify(repairs).includes('/'), 'no absolute path reaches the repair');
    assert.equal(plans, 1);
    assert.equal(voices, 3, 'narration is reused for a rewritten cut');
    assert.equal(env.store.usageEvents().events.filter((e) => e.task === 'video').length, 5);
    if (failure === 'exhausted')
      assert.equal((await env.get(`/api/trees/${tree.id}/artifacts/${row.id}/media`)).status, 404);
  });

test('Retry after a failed cut rewrites only that cut, keeps the rest and publishes; a different version plans fresh; cancel and late output stay rejected', async (t) => {
  const plan = planFor(composition, 3);
  plan.cuts.forEach((c, i) => {
    c.narration = `Narration ${i}`;
  });
  const writes = [0, 0, 0],
    voices = [0, 0, 0];
  let plans = 0,
    broken = true,
    hold;
  const env = await open(
    {
      generate: async (tree, text, emit) => {
        if (tree.id) return complete(emit, 'Watch.' + directive);
        if (tree.instructions.startsWith('You plan')) {
          plans++;
          return complete(emit, JSON.stringify(plan));
        }
        const i = plan.cuts.findIndex((c) => c.purpose === fixerTask(text).cut.purpose);
        writes[i]++;
        if (i === 1 && hold) await hold.promise;
        // The failing cut gives up only after its siblings are written and every cut is narrated.
        if (i === 1 && broken)
          for (;;) {
            const row = env.store.tree(chat.id).artifacts.find((a) => a.status === 'pending');
            const cuts = JSON.parse(row?.source ?? '{"cuts":[]}').cuts;
            if (
              cuts.filter((c) => c.status === 'written').length === 2 &&
              cuts.every((c) => c.timing)
            )
              break;
            await new Promise((r) => setTimeout(r, 5));
          }
        complete(
          emit,
          repairAnswer(
            tree,
            text,
            i === 1 && broken
              ? composition.replace('fontSize: 40', "fontSize: 40, color: 'blue'")
              : composition.replace('PRIVATE_SOURCE_MARKER', `CUT_${i}_W${writes[i]}`),
          ),
        );
      },
    },
    {
      videoNarrate: async (script) => {
        voices[plan.cuts.findIndex((c) => c.narration === script)]++;
        return fakeNarration();
      },
      videoRender: fakeRender,
    },
  );
  t.after(async () => {
    await env.app.stop();
    env.store.close();
  });
  const chat = env.store.create('Retry', 'codex');
  await (await env.post(`/api/trees/${chat.id}/messages`, { text: 'Make a video.' })).text();
  const failed = await until(() =>
    env.store.tree(chat.id).artifacts.find((a) => a.status === 'failed'),
  );
  assert.match(failed.error, /^Cut 2 of 3: .+\. Retry keeps the other cuts\.$/);
  await env.app.settled();
  const before = JSON.parse(failed.source);
  assert.deepEqual(writes, [1, 2, 1]);

  // Cancel the retry while its one cut write is held; the released late output must not publish.
  hold = Promise.withResolvers();
  await env.post(`/api/trees/${chat.id}/artifacts/${failed.id}/retry`);
  await until(() => writes[1] === 3);
  await env.post(`/api/trees/${chat.id}/artifacts/${failed.id}/cancel`);
  broken = false;
  hold.resolve();
  await env.app.settled();
  assert.equal(env.store.artifact(chat.id, failed.id).status, 'canceled');
  assert.equal((await env.get(`/api/trees/${chat.id}/artifacts/${failed.id}/media`)).status, 404);
  assert.deepEqual(writes, [1, 3, 1]);
  assert.equal(plans, 1);

  // Retry from the canceled attempt has nothing settled to keep, so it fails again with a fresh plan.
  hold = null;
  broken = true;
  await env.post(`/api/trees/${chat.id}/artifacts/${failed.id}/retry`);
  const again = await until(
    () =>
      ['failed'].includes(env.store.artifact(chat.id, failed.id).status) &&
      env.store.artifact(chat.id, failed.id),
  );
  await env.app.settled();
  assert.equal(plans, 2);
  assert.deepEqual(writes, [2, 5, 2]);
  assert.deepEqual(voices, [2, 2, 2]);
  const prior = JSON.parse(again.source);

  broken = false;
  await env.post(`/api/trees/${chat.id}/artifacts/${failed.id}/retry`);
  const ready = await until(() => {
    const row = env.store.artifact(chat.id, failed.id);
    return row.status === 'ready' && row;
  });
  assert.equal(plans, 2, 'Retry makes no plan call');
  assert.deepEqual(writes, [2, 6, 2], 'exactly one cut call');
  assert.deepEqual(voices, [2, 2, 2], 'narration and timing are reused');
  assert.notEqual(ready.attempt, again.attempt);
  const data = JSON.parse(ready.source);
  assert.deepEqual(data.plan, prior.plan);
  for (const i of [0, 2]) {
    assert.equal(data.cuts[i].code, prior.cuts[i].code);
    assert.deepEqual(data.cuts[i].timing, prior.cuts[i].timing);
  }
  assert.match(data.cuts[1].code, /CUT_1_W6/);
  assert.ok(before.cuts[1].status === 'failed');
  assert.equal((await env.get(`/api/trees/${chat.id}/artifacts/${ready.id}/cuts`)).status, 200);

  await env.post(`/api/trees/${chat.id}/artifacts/${ready.id}/regenerate`);
  await until(() =>
    env.store.tree(chat.id).artifacts.some((a) => a.id !== ready.id && a.status === 'ready'),
  );
  assert.equal(plans, 3, 'a different version plans fresh');
  assert.deepEqual(writes, [3, 7, 3]);
});

test('a provider failure while writing a cut keeps its own wording', async (t) => {
  const plan = planFor(composition, 2);
  const env = await open(
    {
      generate: async (tree, text, emit) => {
        if (tree.id) return complete(emit, 'Watch.' + directive);
        if (tree.instructions.startsWith('You plan')) return complete(emit, JSON.stringify(plan));
        throw new Error('401 from /home/u/secret');
      },
    },
    { videoNarrate: async () => fakeNarration(), videoRender: fakeRender },
  );
  t.after(async () => {
    await env.app.stop();
    env.store.close();
  });
  const tree = env.store.create('Provider', 'codex');
  await (await env.post(`/api/trees/${tree.id}/messages`, { text: 'Make a video.' })).text();
  const row = await until(() =>
    env.store.tree(tree.id).artifacts.find((a) => a.status === 'failed'),
  );
  assert.equal(row.error, 'Video provider failed to generate a composition.');
});

test('the first diagnostic line names the error without absolute paths', () => {
  assert.equal(
    firstDiagnostic(
      'Traceback (most recent call last):\n  File "/home/u/cut-0/Cut.py", line 3\nNameError: name \'Foo\' is not defined\n',
    ),
    "NameError: name 'Foo' is not defined",
  );
  assert.equal(
    firstDiagnostic(
      "Error: Module not found: Error: Can't resolve './x' in '/home/u/video-work/a/1/cut-0'\nmore",
    ),
    "Error: Module not found: Error: Can't resolve './x' in '[path]'",
  );
  assert.equal(firstDiagnostic('\n at file:///home/u/a.tsx:12:5 1/2\n'), 'at [path]:12:5 1/2');
  assert.equal(firstDiagnostic(''), undefined);
});
