import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
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
  patchOf,
} from '../support/video-kit.mjs';
import { MANIM_AUDIT_INSTRUCTIONS } from '../../server/media/manim-cut.mjs';
import { FIX_NOTE } from '../../server/media/video-cut.mjs';

const original = manimCut.trim();
const fixes = {
  unchanged: null,
  changed: original.replace('"Winner"', '"Audited"'),
  'broken check': original.replace('colors["winner"]', 'RED'),
  'broken render': original.replace('"Winner"', '"Unrenderable"'),
};
const clipOf = (ws) => readFileSync(join(ws, 'public/manim.mp4'), 'latin1');

for (const [name, fix] of Object.entries(fixes))
  test(`Manim cut audited from frames of its clip: ${name} fix`, async (t) => {
    const plan = planFor(composition);
    plan.cuts[0].engine = 'manim';
    const audits = [],
      fixes = [],
      shots = [],
      events = [];
    let finalClip;
    const env = await open(
      {
        generate: async (tree, text, emit) => {
          if (tree.id) return complete(emit, 'Watch.' + directive);
          if (tree.instructions.startsWith('You plan')) return complete(emit, JSON.stringify(plan));
          if (tree.instructions.endsWith(FIX_NOTE)) {
            fixes.push(fixerTask(text));
            return complete(emit, JSON.stringify({ patch: patchOf(fixes.at(-1).code, fix) }));
          }
          if (tree.instructions !== MANIM_AUDIT_INSTRUCTIONS) return complete(emit, manimCut);
          audits.push({ input: JSON.parse(text), images: tree.images });
          complete(
            emit,
            JSON.stringify(
              fix ? { issues: [{ what: 'Label clipped', where: 'top left' }] } : { ok: true },
            ),
          );
        },
      },
      {
        videoManim: {
          detect: () => ({ ready: true, python: 'fake-python' }),
          // The real check-only validator, run without the sandbox.
          check: async (ws) => {
            events.push('check');
            const result = spawnSync(
              'python3',
              ['-I', '-B', join(process.cwd(), 'server/media/manim-render.py'), '--check'],
              { cwd: ws, encoding: 'utf8' },
            );
            const answer = JSON.parse(result.stdout.trim().split('\n').at(-1));
            if (answer.error) throw new Error(answer.error);
          },
          // Each clip carries the code it was rendered from.
          render: async (ws, out) => {
            const code = readFileSync(join(ws, 'Cut.py'), 'utf8');
            events.push('render');
            if (code.includes('Unrenderable')) throw new Error('Manim render fixture failed.');
            const result = await fakeRender(ws, out);
            writeFileSync(out, Buffer.concat([readFileSync(out), Buffer.from(code)]));
            return result;
          },
        },
        videoSnapshot: async (ws, list) => {
          shots.push([readFileSync(join(ws, 'Video.tsx'), 'utf8'), clipOf(ws)]);
          for (const { file } of list) writeFileSync(file, 'jpeg');
        },
        videoRender: async (ws, out) => {
          if (ws.endsWith('cut-0')) finalClip = clipOf(ws);
          return fakeRender(ws, out);
        },
      },
    );
    t.after(async () => {
      await env.app.stop();
      env.store.close();
    });
    const chat = env.store.create('Audited math', 'codex');
    await (await env.post(`/api/trees/${chat.id}/messages`, { text: 'Make a video.' })).text();
    const row = await until(() =>
      env.store.tree(chat.id).artifacts.find((a) => ['ready', 'failed'].includes(a.status)),
    );
    assert.equal(row.status, 'ready', row.error);
    // The clip renders first; the audit's stills come from the staged clip wrapper.
    assert.equal(shots.length, 1);
    assert.match(shots[0][0], /OffthreadVideo/);
    assert.ok(shots[0][1].endsWith(original));
    assert.equal(audits.length, 1);
    assert.equal(audits[0].input.code, original);
    assert.equal(audits[0].input.setPieces, undefined);
    assert.equal(audits[0].images.length, 2);
    // Issues produce exactly one chat-model fix carrying them; ok makes no extra call.
    assert.equal(fixes.length, fix ? 1 : 0);
    if (fix) assert.deepEqual(fixes[0].issues, [{ what: 'Label clipped', where: 'top left' }]);
    const accepted = name === 'changed';
    assert.deepEqual(
      events,
      {
        unchanged: ['check', 'render'],
        changed: ['check', 'render', 'check', 'render'],
        'broken check': ['check', 'render', 'check'],
        'broken render': ['check', 'render', 'check', 'render'],
      }[name],
    );
    const saved = JSON.parse(row.source).cuts[0];
    assert.equal(saved.code, accepted ? fix : original);
    assert.equal(saved.audited, true);
    assert.ok(finalClip.endsWith(accepted ? fix : original), 'the MP4 uses the kept clip');
  });
