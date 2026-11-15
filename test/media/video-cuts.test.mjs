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
} from '../support/video-kit.mjs';
import { fakeNarration } from '../support/fake-narration.mjs';
import { tutorContext } from '../../server/media/diagrams.mjs';
import { firstDiagnostic } from '../../server/media/video-sandbox.mjs';

const gate = () => Promise.withResolvers();

test('three cut writers and narrators start in parallel; reversed completions persist in plan order with measured pauses and per-call usage', async (t) => {
  const plan = planFor(composition, 3);
  plan.cuts.forEach((c, i) => {
    c.narration = `Narration ${i}`;
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
        const input = JSON.parse(text),
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
    ['ready', 'ready', 'ready'],
  );
  data.cuts.forEach((cut, i) => {
    assert.match(cut.code, new RegExp(`CUT_${i}_PRIVATE`));
    assert.equal(cut.engine, 'remotion');
    assert.equal(cut.timing.audioFrames, 60, 'ffprobe measured the fixture MP3');
    assert.equal(cut.timing.durationInFrames, 75);
    assert.equal(cut.timing.transitionIn, i > 0);
    assert.deepEqual(inputs[i].input.styleBrief, plan.styleBrief);
    assert.deepEqual(inputs[i].input.cut, plan.cuts[i]);
    assert.equal(inputs[i].input.previousEndState, i ? plan.cuts[i - 1].endState : null);
    assert.equal(inputs[i].tree.thread, null);
    assert.ok(!('messages' in inputs[i].tree));
  });
  assert.equal(planning, 1);
  assert.equal(ready.duration, 7.5);
  assert.deepEqual(
    renders.map((ws) => basename(ws)),
    ['cut-0', 'cut-1', 'cut-2', ready.attempt],
  );
  const joinData = JSON.parse(readFileSync(join(renders.at(-1), 'cuts.json')));
  assert.deepEqual(
    joinData.map((c) => basename(dirname(dirname(c.file)))),
    ['cut-0', 'cut-1', 'cut-2'],
  );
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

for (const failure of ['brief', 'render', 'exhausted'])
  test(`${failure}: only the failed cut is rewritten within the repair budget`, async (t) => {
    const plan = planFor(composition, 3),
      writes = [0, 0, 0],
      renderCounts = [0, 0, 0],
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
          const input = JSON.parse(text),
            i = plan.cuts.findIndex((c) => c.purpose === input.cut.purpose);
          writes[i]++;
          if (writes[i] > 1) repairs.push(input.validationError);
          complete(
            emit,
            i === 1 && (failure === 'exhausted' || (failure === 'brief' && writes[i] === 1))
              ? composition.replace('fontSize: 40', "fontSize: 40, color: 'blue'")
              : composition,
          );
        },
      },
      {
        videoNarrate: async () => {
          voices++;
          return fakeNarration();
        },
        videoRender: async (ws, out) => {
          const match = /^cut-(\d)$/.exec(basename(ws));
          if (match) {
            const i = Number(match[1]);
            renderCounts[i]++;
            if (failure === 'render' && i === 1 && renderCounts[i] === 1)
              throw Object.assign(new Error('Video rendering failed.'), {
                diagnostic: `TypeError: shape is not a function at ${ws}/Video.tsx:3:4`,
              });
          }
          return fakeRender(ws, out);
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
    if (failure === 'render')
      assert.equal(repairs[0], 'TypeError: shape is not a function at [path]:3:4');
    if (failure === 'exhausted') assert.match(row.error, /^Cut 2 of 3: \S.*\.$/);
    assert.ok(!JSON.stringify(repairs).includes('/'), 'no absolute path reaches the repair');
    assert.equal(plans, 1);
    assert.equal(voices, 3, 'narration is reused for a rewritten cut');
    assert.equal(env.store.usageEvents().events.filter((e) => e.task === 'video').length, 5);
    if (failure !== 'exhausted')
      assert.deepEqual(renderCounts, failure === 'render' ? [1, 2, 1] : [1, 1, 1]);
    else
      assert.equal((await env.get(`/api/trees/${tree.id}/artifacts/${row.id}/media`)).status, 404);
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
