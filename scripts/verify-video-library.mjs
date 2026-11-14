// Library UI check on a copy of a generated-video database: migration, keyboard navigation, playback,
// unavailable state and source deletion in both appearances, with no provider or narration calls.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';
import { mediaPath } from '../server/videos.mjs';

const [
  input = 'docs/verification/narrated-video-native-codex.json',
  output = 'docs/verification/video-library.json',
] = process.argv.slice(2);
const native = JSON.parse(readFileSync(input)),
  dir = mkdtempSync(join(tmpdir(), 'tt-video-library-'));
mkdirSync(join(dir, 'videos'));
copyFileSync(join(native.data, 'trees.sqlite'), join(dir, 'trees.sqlite'));
copyFileSync(mediaPath(native.data, native.media.id), mediaPath(dir, native.media.id));
const legacy = new Store(join(dir, 'trees.sqlite'));
// Opening the saved copy creates the library table; drop it again so the reopen below migrates like a pre-library database.
// A second ready video whose file was never copied: the library must show it unavailable.
const source = legacy.db
  .prepare('SELECT conversation,message FROM artifacts WHERE id=?')
  .get(native.media.id);
const lost = legacy.pendingArtifact(
  source.conversation,
  source.message,
  'Missing file video',
  'Its saved file is gone.',
  'video',
  '{}',
);
legacy.db.prepare("UPDATE artifacts SET status='ready',duration=3 WHERE id=?").run(lost.id);
legacy.db.exec('DROP TABLE videos');
legacy.close();

const store = new Store(join(dir, 'trees.sqlite')),
  root = store
    .list()
    .find((t) => !t.parent && store.descendants(t.id).includes(source.conversation));
const usage = JSON.stringify(store.usageEvents());
let calls = 0;
const app = createApp({
  store,
  dir,
  provider: {
    models: async () => [],
    generate: async () => {
      calls++;
      throw new Error('Library must not generate');
    },
  },
  videoNarrate: async () => {
    calls++;
    throw new Error('Library must not narrate');
  },
  auth: { status: () => ({ connected: true }) },
});
await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${app.server.address().port}`;
const run = promisify(execFile),
  session = (
    await run('agent-browser', [
      'session',
      'id',
      '--scope',
      'worktree',
      '--prefix',
      'video-library',
    ])
  ).stdout.trim();
const b = async (...args) =>
  (await run('agent-browser', ['--session', session, ...args], { maxBuffer: 1024 * 1024 })).stdout;
const ev = async (script) => JSON.parse(await b('eval', script, '--json')).data.result;
const card = (id) => `.video-library [data-artifact="${id}"]`;
const report = {
  checkedAt: new Date().toISOString(),
  media: native.media.id,
  evidence:
    'Copy of saved database and generated MP4 in the production build and actual Chromium player',
  inputEvidence: native.evidence,
  checks: [],
};
const openLibrary = async () => {
  await b('wait', '.view-tabs');
  // Keyboard: focus the band's Videos tab and press Enter; focus stays on the tab, now current.
  await ev(
    `[...document.querySelectorAll('.view-tabs button')].find(x=>x.textContent.trim()==='Videos').focus();true`,
  );
  await b('press', 'Enter');
  await b('wait', card(native.media.id) + ' video');
  return ev(
    `({focus:document.activeElement?.textContent.trim(),current:document.querySelector('.view-tabs [aria-current=page]')?.textContent.trim(),heading:document.querySelector('.video-library')?.closest('.knowledge-content')?.querySelector('h1')?.textContent})`,
  );
};
const play = async () => {
  const v = JSON.stringify(card(native.media.id) + ' video');
  const position = Math.min(20, native.media.duration / 3);
  await ev(
    `(async()=>{const v=document.querySelector(${v});v.scrollIntoView({block:'center'});v.currentTime=${position};await v.play();return true})()`,
  );
  await b(
    'wait',
    '--fn',
    `(v=>!v.paused&&!v.seeking&&v.readyState>=3&&v.currentTime>${position + 0.3})(document.querySelector(${v}))`,
  );
  await ev(`document.querySelector(${v}).pause();true`);
  return ev(
    `(v=>({width:v.videoWidth,height:v.videoHeight,duration:v.duration,src:v.getAttribute('src')}))(document.querySelector(${v}))`,
  );
};
try {
  await b('open', origin);
  await b('set', 'viewport', '1280', '800');
  const nav = await openLibrary();
  assert.deepEqual(nav, { focus: 'Videos', current: 'Videos', heading: 'Videos' });
  report.checks.push({
    name: 'band Videos tab opens the library by keyboard and becomes current',
    ...nav,
  });
  const lostState = await ev(
    `(c=>({state:c.dataset.state,video:!!c.querySelector('video'),buttons:[...c.querySelectorAll('button')].map(b=>b.textContent.trim()),status:c.querySelector('[role=status]').textContent}))(document.querySelector(${JSON.stringify(card(lost.id))}))`,
  );
  assert.equal(lostState.state, 'unavailable');
  assert.equal(lostState.video, false);
  assert.deepEqual(lostState.buttons, ['Remove from Videos']);
  report.checks.push({
    name: 'missing file shows unavailable, no player, no regenerate action; only Remove from Videos',
    ...lostState,
  });
  const played = await play();
  assert.equal(played.width, 640);
  assert.ok(Math.abs(played.duration - native.media.duration) < 0.1);
  assert.equal(played.src, `/api/videos/${native.media.id}/media`);
  report.checks.push({
    name: 'migrated saved video plays and seeks from the library route',
    ...played,
  });

  assert.equal(
    (await (await fetch(origin + '/api/state')).json()).trees.some((t) => t.id === root.id),
    true,
  );
  const { csrf } = await (await fetch(origin + '/api/state')).json();
  const deleted = await fetch(`${origin}/api/trees/${root.id}/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf },
    body: JSON.stringify({ conversation: root.id }),
  });
  assert.equal(deleted.status, 200);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM artifacts').get().n, 0);
  mkdirSync('.impeccable/review', { recursive: true });
  for (const mode of ['dark', 'light']) {
    await ev(
      `localStorage.setItem('treetutor.appearance',${JSON.stringify(mode)});location.reload();true`,
    );
    await openLibrary();
    await play();
    await b('screenshot', resolve(`.impeccable/review/video-library-${mode}.png`));
  }
  report.checks.push({
    name: 'after deleting the source chat the library still lists and plays the video in dark and light after reload',
  });
  assert.equal(calls, 0);
  assert.equal(JSON.stringify(store.usageEvents()), usage);
  report.checks.push({ name: 'no provider or narration calls; recorded usage unchanged', calls });
  report.pass = true;
  console.log(
    'PASS: library migration, keyboard navigation, playback, unavailable state and source deletion; dark/light; no inference.',
  );
} finally {
  await b('close').catch(() => {});
  await app.stop();
  store.close();
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
}
