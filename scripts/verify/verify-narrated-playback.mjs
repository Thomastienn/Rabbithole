// Reopen a native smoke artifact and decode it through the production player; no generation is allowed.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';

// argv: native smoke report (default: the 2D Codex run) and the output report.
const [
  input = 'docs/verification/narrated-video-native-codex.json',
  output = 'docs/verification/narrated-playback.json',
] = process.argv.slice(2);
const native = JSON.parse(readFileSync(input));
const store = new Store(join(native.data, 'trees.sqlite'));
const tree = store.tree(
  store.db.prepare('SELECT conversation FROM artifacts WHERE id=?').get(native.media.id)
    .conversation,
);
let calls = 0;
const app = createApp({
  store,
  dir: native.data,
  provider: {
    models: async () => [],
    generate: async () => {
      calls++;
      throw new Error('Playback must not generate');
    },
  },
  videoNarrate: async () => {
    calls++;
    throw new Error('Playback must not narrate');
  },
  auth: { status: () => ({ connected: true }) },
});
await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
const run = promisify(execFile),
  session = (
    await run('agent-browser', [
      'session',
      'id',
      '--scope',
      'worktree',
      '--prefix',
      'narrated-playback',
    ])
  ).stdout.trim();
const b = async (...args) =>
  (await run('agent-browser', ['--session', session, ...args], { maxBuffer: 1024 * 1024 })).stdout;
const ev = async (script) => JSON.parse(await b('eval', script, '--json')).data.result;
const video = `.focused-chat [data-artifact="${native.media.id}"] video`;
const report = {
  checkedAt: new Date().toISOString(),
  media: native.media.id,
  evidence:
    'Native generated media in restarted production app and actual Chromium player; no controlled media substitution',
  checks: [],
};
try {
  await b('open', `http://127.0.0.1:${app.server.address().port}`);
  await b('set', 'viewport', '1280', '800');
  await b('wait', `[aria-label="Open ${tree.title}"]`);
  if (!(await ev(`!!document.querySelector(${JSON.stringify(video)})`)))
    await b('find', 'role', 'button', 'click', '--name', `Open ${tree.title}`, '--exact');
  await b(
    'wait',
    '--fn',
    `(v=>v&&v.readyState>=2)(document.querySelector(${JSON.stringify(video)}))`,
  );
  const saved = await ev(
    `(v=>({paused:v.paused,controls:v.controls,duration:v.duration,width:v.videoWidth,height:v.videoHeight}))(document.querySelector(${JSON.stringify(video)}))`,
  );
  assert.equal(saved.paused, true);
  assert.equal(saved.controls, true);
  assert.equal(saved.width, 640);
  assert.equal(saved.height, 360);
  assert.ok(Math.abs(saved.duration - native.media.duration) < 0.1);
  report.checks.push({ name: 'saved paused player decodes after app/store restart', ...saved });
  await ev(
    `(async()=>{const v=document.querySelector(${JSON.stringify(video)});v.currentTime=20;await v.play();return true})()`,
  );
  await b(
    'wait',
    '--fn',
    `(v=>!v.paused&&v.currentTime>20.3)(document.querySelector(${JSON.stringify(video)}))`,
  );
  await ev(`document.querySelector(${JSON.stringify(video)}).pause();true`);
  mkdirSync('.impeccable/review', { recursive: true });
  for (const mode of ['dark', 'light']) {
    await ev(
      `localStorage.setItem('treetutor.appearance',${JSON.stringify(mode)});location.reload();true`,
    );
    await b('wait', `[aria-label="Open ${tree.title}"]`);
    if (!(await ev(`!!document.querySelector(${JSON.stringify(video)})`)))
      await b('find', 'role', 'button', 'click', '--name', `Open ${tree.title}`, '--exact');
    await b('wait', video);
    await ev(
      `(async()=>{const v=document.querySelector(${JSON.stringify(video)});v.currentTime=20;v.scrollIntoView({block:'center'});await v.play();return true})()`,
    );
    await b(
      'wait',
      '--fn',
      `(v=>v.readyState===4&&!v.seeking&&v.currentTime>20.4)(document.querySelector(${JSON.stringify(video)}))`,
    );
    await ev(`document.querySelector(${JSON.stringify(video)}).pause();true`);
    await b(
      'screenshot',
      resolve(`.impeccable/review/${native.mode ?? '2d'}-playback-${mode}.png`),
    );
  }
  assert.equal(calls, 0);
  report.checks.push({
    name: 'saved native audio/video plays, seeks and reloads in both appearances without generation',
    calls,
  });
  report.pass = true;
  console.log(
    'PASS: native saved narrated video decoded, played and sought after restart; dark/light; no inference or TTS.',
  );
} finally {
  await b('close').catch(() => {});
  await app.stop();
  store.close();
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
}
