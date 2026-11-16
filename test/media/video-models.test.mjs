import { test } from 'node:test';
import assert from 'node:assert/strict';
import { basename } from 'node:path';
import { writeFileSync } from 'node:fs';
import {
  planFor,
  composition,
  directive,
  complete,
  until,
  open,
  fakeRender,
} from '../support/video-kit.mjs';
import { AUDIT_INSTRUCTIONS, REPAIR_NOTE, FIX_NOTE } from '../../server/media/video-cut.mjs';
import {
  TEACHING_SKILL,
  HUMANIZER_SKILL,
  MANIM_TEACHING_SKILL,
} from '../../server/media/skills.mjs';

const look = 'A rounded box 240x120 px with a crown on top.';
const pieces = `import { colors, palette } from './kit';
export function Winner({ x, y, scale = 1, highlight = false }) {
  return <div style={{ position: 'absolute', left: x, top: y, width: 240 * scale, height: 120 * scale, background: highlight ? colors.winner : palette.raised }}>Winner</div>;
}`;
const plan = planFor(composition);
plan.styleBrief = {
  ...plan.styleBrief,
  recurringObjects: [{ ...plan.styleBrief.recurringObjects[0], look }],
};
const smart = { provider: 'codex', model: 'smart-model', effort: 'high' };
const stageOf = (instructions) =>
  instructions.startsWith('You plan')
    ? 'plan'
    : instructions.startsWith('You write the set pieces')
      ? 'pieces'
      : instructions === AUDIT_INSTRUCTIONS
        ? 'audit'
        : instructions.endsWith(REPAIR_NOTE)
          ? 'repair'
          : instructions.endsWith(FIX_NOTE)
            ? 'fix'
            : 'cut';

test('a video freezes smart and chat selections: smart plans and audits, chat writes pieces, cuts, repairs and fixes; Retry keeps both; legacy jobs use one for both; usage follows each call', async (t) => {
  const calls = [],
    skills = {};
  let renderFails = Infinity,
    audits = 0;
  const env = await open(
    {
      models: async () => [
        { model: 'chat-model', isDefault: true, efforts: ['low', 'high'] },
        { model: 'smart-model', efforts: ['low', 'high'] },
        { model: 'other-model', efforts: ['low', 'high'] },
      ],
      generate: async (tree, text, emit) => {
        if (tree.id) return complete(emit, 'Watch.' + directive);
        const stage = stageOf(tree.instructions);
        calls.push([stage, tree.model, tree.effort]);
        skills[stage] = [TEACHING_SKILL, HUMANIZER_SKILL, MANIM_TEACHING_SKILL].map((skill) =>
          tree.instructions.includes(skill),
        );
        if (stage === 'plan') return complete(emit, JSON.stringify(plan));
        if (stage === 'pieces') return complete(emit, pieces);
        // The first audit flags its cut, so one fix runs; later audits pass.
        if (stage === 'audit')
          return complete(
            emit,
            ++audits === 1
              ? '{"issues":[{"what":"Label overlaps","where":"centre"}]}'
              : '{"ok":true}',
          );
        if (stage === 'fix') return complete(emit, JSON.stringify({ code: composition }));
        complete(emit, composition);
      },
    },
    {
      videoSnapshot: async (_dir, list) => {
        for (const { file } of list) writeFileSync(file, 'jpeg');
      },
      videoRender: async (ws, out) => {
        if (/^cut-\d$/.test(basename(ws)) && renderFails-- > 0)
          throw Object.assign(new Error('Video rendering failed.'), { diagnostic: 'Bad frame.' });
        return fakeRender(ws, out);
      },
    },
  );
  t.after(async () => {
    await env.app.stop();
    env.store.close();
  });
  await env.post('/api/settings/smart', {
    model: { provider: smart.provider, model: smart.model },
    followEffort: false,
    effort: smart.effort,
  });
  const chat = env.store.create('Models', 'codex', 'chat-model', 'low');
  await (await env.post(`/api/trees/${chat.id}/messages`, { text: 'Make a video.' })).text();
  const failed = await until(() =>
    env.store.tree(chat.id).artifacts.find((a) => a.status === 'failed'),
  );
  const input = JSON.parse(failed.input);
  assert.deepEqual(input.selection, smart);
  assert.deepEqual(input.chat, { provider: 'codex', model: 'chat-model', effort: 'low' });
  const byStage = (list) =>
    Object.fromEntries(list.map(([stage, model, effort]) => [stage, `${model}/${effort}`]));
  assert.deepEqual(byStage(calls), {
    plan: 'smart-model/high',
    pieces: 'chat-model/low',
    cut: 'chat-model/low',
    audit: 'smart-model/high',
    repair: 'chat-model/low',
    fix: 'chat-model/low',
  });
  assert.ok(calls.filter(([s]) => s === 'repair').length >= 1);
  // The planner writes the narration, so only it gets the teaching and humanizer skills (Manim notes scoped to Manim cuts).
  for (const [stage, present] of Object.entries(skills))
    assert.deepEqual(present, Array(3).fill(stage === 'plan'), stage);

  // Usage history attributes each call to its own model.
  const usage = () =>
    env.store
      .usageEvents()
      .events.filter((e) => e.task === 'video')
      .map((e) => e.model);
  assert.deepEqual(
    usage(),
    calls.map(([, model]) => model),
  );

  // Retry keeps both frozen selections after Settings and the conversation change.
  await env.post('/api/settings/smart', {
    model: { provider: 'codex', model: 'other-model' },
    followEffort: false,
    effort: 'low',
  });
  env.store.model(chat.id, 'other-model');
  calls.length = 0;
  renderFails = 0;
  await env.post(`/api/trees/${chat.id}/artifacts/${failed.id}/retry`);
  const retried = await until(() => {
    const a = env.store.artifact(chat.id, failed.id);
    return a.status !== 'pending' && a;
  });
  assert.equal(retried.status, 'ready', retried.error);
  assert.equal(retried.input, failed.input);
  assert.ok(calls.length);
  assert.deepEqual(byStage(calls), { cut: 'chat-model/low', audit: 'smart-model/high' });

  // A legacy job with one frozen selection uses it for every role.
  const legacy = env.store.pendingArtifact(
    chat.id,
    failed.message,
    'Legacy',
    'Legacy',
    'video',
    JSON.stringify({ selection: smart, request: 'Make a video.' }),
  );
  env.store.cancelVideo(chat.id, legacy.id);
  calls.length = 0;
  await env.post(`/api/trees/${chat.id}/artifacts/${legacy.id}/retry`);
  const done = await until(() => {
    const a = env.store.artifact(chat.id, legacy.id);
    return a.status !== 'pending' && a;
  });
  assert.equal(done.status, 'ready', done.error);
  assert.deepEqual(new Set(calls.map(([, m, e]) => `${m}/${e}`)), new Set(['smart-model/high']));
  assert.ok(calls.some(([s]) => s === 'cut') && calls.some(([s]) => s === 'pieces'));
  assert.equal(JSON.parse(done.input).chat, undefined);
});
