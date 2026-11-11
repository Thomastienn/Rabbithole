// Live desktop check of library Show in folder and Move to trash on disposable videos, driven by keyboard in the
// production build. Reveal and trash use the real desktop boundary (FileManager1/xdg-open and gio trash); only the
// one failed-trash UI check wraps it with an injected failure. Requires a running desktop session.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';
import { mediaPath } from '../server/videos.mjs';
import { desktop } from '../server/desktop.mjs';

const [output = 'docs/verification/video-actions.json'] = process.argv.slice(2);
const run = promisify(execFile), dir = mkdtempSync(join(tmpdir(), 'tt-video-actions-'));
const store = new Store(join(dir, 'trees.sqlite')), tree = store.create('Disposable chat'), ids = {};
const media = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(4096, 7)]);
mkdirSync(join(dir, 'videos'));
for (const name of ['Disposable trash video', 'Disposable failing video']) {
  const message = store.message(tree.id, 'assistant', 'Reply', 'completed'), v = store.pendingArtifact(tree.id, message, name, 'A disposable smoke-test video.', 'video', '{}');
  store.finishVideo(tree.id, v.id, v.attempt, { description: 'A disposable smoke-test video.', duration: 1 });
  writeFileSync(mediaPath(dir, v.id), media);
  ids[name] = v.id;
}
store.record('video:smoke', 'video', { provider: 'codex', model: 'fixture-model' }, { input: 1, output: 1, cacheRead: 0 });
const usage = JSON.stringify(store.usageEvents()), trashed = ids['Disposable trash video'], failing = ids['Disposable failing video'];
let calls = 0;
const app = createApp({ store, dir, auth: { status: () => ({ connected: true }) },
  provider: { models: async () => [], generate: async () => { calls++; throw new Error('Library must not generate'); } },
  desktop: { reveal: desktop.reveal, trash: p => p === mediaPath(dir, failing) ? Promise.reject(new Error('injected failure')) : desktop.trash(p) } });
await new Promise(r => app.server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${app.server.address().port}`;
const session = (await run('agent-browser', ['session', 'id', '--scope', 'worktree', '--prefix', 'video-actions'])).stdout.trim();
const b = async (...args) => (await run('agent-browser', ['--session', session, ...args], { maxBuffer: 1024 * 1024 })).stdout;
const ev = async script => JSON.parse(await b('eval', script, '--json')).data.result;
const windows = async () => (await run('wmctrl', ['-lx'])).stdout.split('\n').filter(Boolean);
const press = async (label, scope = 'body') => { await ev(`[...document.querySelectorAll(${JSON.stringify(scope + ' button')})].find(x=>x.getAttribute('aria-label')===${JSON.stringify(label)}||x.textContent.trim()===${JSON.stringify(label)}).focus();true`); await b('press', 'Enter'); };
const report = { checkedAt: new Date().toISOString(), evidence: 'Live desktop session (DISPLAY, session D-Bus), real file manager and gio trash; production build in Chromium via agent-browser', data: dir, checks: [] };
const trashDir = join(homedir(), '.local/share/Trash');
let opened = [];
try {
  await b('open', origin);
  await b('set', 'viewport', '1280', '800');
  await b('wait', '.tree-navigation-footer');
  await ev(`[...document.querySelectorAll('.tree-navigation-footer button')].find(x=>x.textContent.trim()==='Videos').focus();true`);
  await b('press', 'Enter');
  await b('wait', `.video-library [data-artifact="${trashed}"]`);

  // Show in folder: a new file-manager window opens on the app's videos folder.
  const before = await windows();
  await press('Show “Disposable trash video” in folder');
  await b('wait', '--fn', `document.querySelector('.knowledge-content').textContent.includes('Opened the folder')`);
  for (let i = 0; i < 40 && !opened.length; i++) { await new Promise(r => setTimeout(r, 250)); opened = (await windows()).filter(w => !before.includes(w)); }
  assert.ok(opened.some(w => /videos/i.test(w)), `no file-manager window on the videos folder: ${opened.join(' | ')}`);
  report.checks.push({ name: 'Show in folder (keyboard) opens a real file-manager window on the selected video folder', windows: opened });

  // Failed trash: dialog stays with the error, entry and file remain.
  await press('Move “Disposable failing video” to the system trash');
  await b('wait', '[role=alertdialog]');
  await press('Move to trash', '[role=alertdialog]');
  await b('wait', '--fn', `document.querySelector('[role=alertdialog]')?.textContent.includes('Nothing was deleted')`);
  assert.ok(existsSync(mediaPath(dir, failing)));
  await press('Keep video', '[role=alertdialog]');
  await b('wait', '--fn', `!document.querySelector('[role=alertdialog]')?.checkVisibility()`);
  const kept = await ev(`!!document.querySelector('.video-library [data-artifact="${failing}"]')`);
  assert.equal(kept, true);
  report.checks.push({ name: 'failed trash keeps the dialog error, the library entry and the file', kept });

  // Real trash: the disposable file lands in the desktop trash and the entry leaves the library.
  await press('Move “Disposable trash video” to the system trash');
  await b('wait', '[role=alertdialog]');
  await press('Move to trash', '[role=alertdialog]');
  await b('wait', '--fn', `!document.querySelector('.video-library [data-artifact="${trashed}"]')`);
  const info = readdirSync(join(trashDir, 'info')).find(f => readFileSync(join(trashDir, 'info', f), 'utf8').includes(`${trashed}.mp4`));
  assert.ok(info, 'trashinfo for the disposable video');
  const inTrash = join(trashDir, 'files', info.replace(/\.trashinfo$/, ''));
  assert.deepEqual(readFileSync(inTrash), media);
  assert.equal(existsSync(mediaPath(dir, trashed)), false);
  const after = await ev(`({status:[...document.querySelectorAll('.knowledge-content [role=status]')].map(x=>x.textContent).join(' | '),focus:document.activeElement?.id})`);
  assert.match(after.status, /Moved “Disposable trash video” to the system trash/);
  report.checks.push({ name: 'Move to trash (keyboard, confirmed) moves the disposable file into the desktop trash and removes the entry', trashInfo: readFileSync(join(trashDir, 'info', info), 'utf8').trim(), ...after });

  mkdirSync('.impeccable/review', { recursive: true });
  for (const mode of ['dark', 'light']) {
    await ev(`localStorage.setItem('treetutor.appearance',${JSON.stringify(mode)});location.reload();true`);
    await b('wait', '.tree-navigation-footer');
    await ev(`[...document.querySelectorAll('.tree-navigation-footer button')].find(x=>x.textContent.trim()==='Videos').click();true`);
    await b('wait', `.video-library [data-artifact="${failing}"]`);
    await b('screenshot', resolve(`.impeccable/review/video-actions-${mode}.png`));
  }
  assert.equal(calls, 0);
  assert.equal(JSON.stringify(store.usageEvents()), usage);
  report.checks.push({ name: 'no provider calls; recorded usage unchanged; dark and light screenshots', calls });
  // Remove only this run's disposable trash item.
  unlinkSync(inTrash); unlinkSync(join(trashDir, 'info', info));
  report.pass = true; console.log('PASS: live Show in folder and system trash; failed trash keeps entry; usage unchanged.');
} finally {
  for (const w of opened) await run('wmctrl', ['-ic', w.split(/\s+/)[0]]).catch(() => {});
  await b('close').catch(() => {}); await app.stop(); store.close();
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
}
