// Browser fixture for TreeTutor-vm4.3: Interrupted and Unavailable after restart, Cancel and Retry by keyboard without losing focus,
// regeneration as a new attempt. Synthetic providers; renders run for real in the bubblewrap sandbox. Needs `npm run build`.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { promisify } from 'node:util';
import { execFile, fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';
import { sandboxRender } from '../../server/media/videos.mjs';
import { fakeNarration } from '../../test/fake-narration.mjs';

const filename = fileURLToPath(import.meta.url);
const composition = `// Description: A box labelled Winner rises to the top of the tree.
// Narration: "Winners advance."
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
export const durationInFrames = 30;
export default function Video() {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{ background: 'white', alignItems: 'center', justifyContent: 'center', fontSize: 40, opacity: interpolate(frame, [0, 20], [0, 1]) }}>Winner</AbsoluteFill>;
}`;

if (process.argv[2] === '--serve') {
  const dir = process.argv[3],
    store = new Store(join(dir, 'trees.sqlite'));
  const log = (kind) => appendFileSync(join(dir, 'calls.jsonl'), JSON.stringify({ kind }) + '\n');
  const gates = new Map(),
    released = new Set();
  const provider = {
    models: async () => [{ model: 'fixture-model', label: 'Fixture model', isDefault: true }],
    generate: async (tree, text, emit) => {
      log(tree.instructions?.includes('Remotion') ? 'worker' : 'tutor');
      emit({ type: 'item', item: 'a', text: composition });
      emit({ type: 'status', status: 'completed' });
    },
  };
  // Each render waits for the test, unless its job is canceled first.
  const videoRender = async (workspace, output, signal, onProgress) => {
    const attempt = basename(workspace);
    try {
      await new Promise((resolve, reject) => {
        gates.set(attempt, resolve);
        if (released.has(attempt)) resolve();
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    } finally {
      gates.delete(attempt);
      released.delete(attempt);
    }
    return sandboxRender(workspace, output, signal, onProgress);
  };
  const app = createApp({
    store,
    provider,
    dir,
    videoRender,
    videoNarrate: fakeNarration,
    auth: { status: () => ({ connected: true }) },
  });
  process.on('message', (message) => {
    if (message === 'render') {
      // Narration can still be staging when the UI says Creating; release only the current attempt.
      const attempt = store.db
        .prepare("SELECT attempt FROM artifacts WHERE kind='video' AND status='pending' LIMIT 1")
        .get()?.attempt;
      if (attempt) {
        released.add(attempt);
        gates.get(attempt)?.();
      }
    }
    if (message === 'stop') {
      app.stop();
      store.close();
      process.exit(0);
    }
  });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  process.send({ origin: `http://127.0.0.1:${app.server.address().port}` });
} else {
  const dir = mkdtempSync(join(tmpdir(), 'tt-video-recovery-'));
  const store = new Store(join(dir, 'trees.sqlite'));
  const tree = store.create('Tournament locks');
  const request = store.message(tree.id, 'user', 'Make a video of the winner rising.', 'completed');
  const reply = store.message(tree.id, 'assistant', 'Here is the idea.', 'completed');
  const input = JSON.stringify({
    request: 'Make a video of the winner rising.',
    sources: { conversation: tree.id, requestMessage: request, replyMessage: reply },
  });
  // Left pending as if TreeTutor stopped mid-render; the server start marks it interrupted.
  const stopped = store.pendingArtifact(
    tree.id,
    reply,
    'Winner rising',
    'Planned.',
    'video',
    input,
  );
  const lost = store.pendingArtifact(tree.id, reply, 'Lost video', 'Planned.', 'video', input);
  store.finishVideo(tree.id, lost.id, lost.attempt, {
    description: 'A saved video whose file was deleted.',
    duration: 1,
  });
  const failed = store.pendingArtifact(
    tree.id,
    reply,
    'Failed video',
    'A winner advances.',
    'video',
    input,
    0,
  );
  store.finishVideo(tree.id, failed.id, failed.attempt, {}, 'Video rendering failed.');
  const privateFailure = store.pendingArtifact(
    tree.id,
    reply,
    'Private error',
    'A worker failed.',
    'video',
    input,
  );
  store.finishVideo(
    tree.id,
    privateFailure.id,
    privateFailure.attempt,
    {},
    'PRIVATE_SCRIPT /private/video-work/attempt',
  );
  store.close();
  writeFileSync(join(dir, 'calls.jsonl'), '');

  const run = promisify(execFile);
  const session = (
    await run('agent-browser', [
      'session',
      'id',
      '--scope',
      'worktree',
      '--prefix',
      'video-recovery',
    ])
  ).stdout.trim();
  const b = async (...args) =>
    (await run('agent-browser', ['--session', session, ...args], { maxBuffer: 4 * 1024 * 1024 }))
      .stdout;
  const ev = async (expression) => JSON.parse(await b('eval', expression, '--json')).data.result;
  const wait = (expression, timeout = '30000') =>
    b('wait', '--fn', expression, '--timeout', timeout);
  const calls = () =>
    readFileSync(join(dir, 'calls.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line).kind);
  const checks = [];
  const pass = (name, details = true) => {
    checks.push({ name, pass: true, details });
    console.log('PASS:', name);
  };
  const card = (id) => `document.querySelector('.focused-chat [data-artifact="${id}"]')`;
  const view = (id) =>
    ev(
      `(()=>{const c=${card(id)};return {state:c.dataset.state,status:c.querySelector('[role=status]').textContent,button:c.querySelector('button')?.textContent??null,video:!!c.querySelector('video'),focused:c.contains(document.activeElement)&&document.activeElement.tagName==='BUTTON'}})()`,
    );
  const server = fork(filename, ['--serve', dir], {
    stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
  });
  const { origin } = await new Promise((resolve, reject) => {
    server.once('message', resolve);
    server.once('exit', (code) => reject(new Error(`server exited ${code}`)));
  });
  try {
    await b('open', origin);
    await b('set', 'viewport', '1280', '800');
    await b('wait', '[aria-label="Open Tournament locks"]');
    await b('find', 'role', 'button', 'click', '--name', 'Open Tournament locks', '--exact');
    await wait(`!!${card(stopped.id)} && !!${card(lost.id)}`);
    const restarted = {
      interrupted: await view(stopped.id),
      unavailable: await view(lost.id),
      providerCalls: calls(),
    };
    assert.deepEqual(restarted.interrupted, {
      state: 'interrupted',
      status: 'Winner rising: Video generation interrupted when TreeTutor stopped.',
      button: 'Retry video',
      video: false,
      focused: false,
    });
    assert.deepEqual(restarted.unavailable, {
      state: 'unavailable',
      status: 'Lost video: Video unavailable: its saved file is missing or unreadable.',
      button: 'Regenerate video',
      video: false,
      focused: false,
    });
    assert.deepEqual(restarted.providerCalls, []);
    const failure = await view(failed.id);
    assert.equal(failure.state, 'failed');
    assert.equal(failure.video, false);
    assert.equal(failure.button, 'Retry video');
    assert.equal(failure.status, 'Failed video: Video rendering failed.');
    assert.equal(
      (await view(privateFailure.id)).status,
      'Private error: Video could not be generated. Retry, or check Smart in Settings.',
    );
    assert.equal(
      await ev(`document.querySelector('.focused-chat').textContent.includes('PRIVATE_SCRIPT')`),
      false,
    );
    pass(
      'failure shows its safe reason and Retry; unknown private output gets the generic recovery message',
      failure,
    );
    for (const [mode, width] of [
      ['dark', 1280],
      ['light', 1280],
      ['dark', 390],
      ['light', 390],
    ]) {
      await b('set', 'viewport', String(width), '800');
      await ev(
        `localStorage.setItem('treetutor.appearance', ${JSON.stringify(mode)}); location.reload(); true`,
      );
      await b('wait', '[aria-label="Open Tournament locks"]');
      await b('find', 'role', 'button', 'click', '--name', 'Open Tournament locks', '--exact');
      await wait(`!!${card(failed.id)}`);
      const inline = await ev(
        `(c=>({inline:!!c.closest('.reply-md'),first:c.closest('.reply-md')?.firstElementChild===c,after:c.nextElementSibling?.textContent,border:getComputedStyle(c).borderTopWidth,background:getComputedStyle(c).backgroundColor,legacy:!${card(stopped.id)}.closest('.reply-md'),overflow:document.documentElement.scrollWidth>innerWidth} ))(${card(failed.id)})`,
      );
      assert.deepEqual(inline, {
        inline: true,
        first: true,
        after: 'Here is the idea.',
        border: '0px',
        background: 'rgba(0, 0, 0, 0)',
        legacy: true,
        overflow: false,
      });
      await ev(`${card(failed.id)}.scrollIntoView({block:'center'}); true`);
      await b(
        'screenshot',
        join(process.cwd(), `.impeccable/review/inline-video-failure-${mode}-${width}.png`),
      );
    }
    pass(
      'failure holds its recorded position without chrome in both appearances and widths; legacy videos remain after the reply',
    );
    await b('set', 'viewport', '1280', '800');
    pass(
      'after restart: unfinished job shows Interrupted with Retry, missing file shows Unavailable with Regenerate, no inference replayed',
      restarted,
    );

    // Keyboard: Tab onto Retry, Enter retries, the same button becomes Cancel and keeps focus.
    await ev(`${card(stopped.id)}.querySelector('button').focus()`);
    await b('press', 'Enter');
    await wait(`${card(stopped.id)}.querySelector('button')?.textContent==='Cancel video'`);
    const retrying = await view(stopped.id);
    assert.match(retrying.status, /^Winner rising: (?:Creating|Rendering) video…$/);
    assert.deepEqual(
      { ...retrying, status: undefined },
      { state: 'pending', status: undefined, button: 'Cancel video', video: false, focused: true },
    );
    await wait(`${card(stopped.id)}.dataset.state==='pending'`);
    pass('Retry by keyboard starts a new attempt; focus stays on the action, now Cancel', retrying);

    await b('press', 'Enter');
    await wait(`${card(stopped.id)}.dataset.state==='canceled'`);
    await wait(`${card(stopped.id)}.querySelector('button')?.textContent==='Retry video'`);
    const canceled = await view(stopped.id);
    assert.deepEqual(canceled, {
      state: 'canceled',
      status: 'Winner rising: Video generation canceled.',
      button: 'Retry video',
      video: false,
      focused: true,
    });
    server.send('render'); // the canceled attempt's render gate is already rejected; nothing may publish
    await new Promise((r) => setTimeout(r, 1500));
    assert.equal((await view(stopped.id)).state, 'canceled');
    pass(
      'Cancel by keyboard shows Canceled, keeps focus on Retry, and stays canceled afterwards',
      canceled,
    );
    await ev(`${card(stopped.id)}.scrollIntoView({block:'center'}); true`);
    await b('screenshot', join(process.cwd(), '.impeccable/review/smart-video-canceled.png'));

    const messages = await ev(
      `document.querySelectorAll('.focused-chat .astryx-chat-message').length`,
    );
    await b('press', 'Enter');
    await wait(`${card(stopped.id)}.dataset.state==='pending'`);
    server.send('render');
    await wait(`${card(stopped.id)}.dataset.state==='ready'`, '120000');
    await wait(`${card(stopped.id)}.querySelector('video')?.readyState>=1`);
    const ready = await ev(
      `(()=>{const c=${card(stopped.id)},v=c.querySelector('video');return {paused:v.paused,autoplay:v.autoplay,duration:Math.round(v.duration),description:c.querySelector('p, [id$=-description]')?.textContent,messages:document.querySelectorAll('.focused-chat .astryx-chat-message').length,focusInCard:c.contains(document.activeElement)}})()`,
    );
    assert.equal(ready.paused, true);
    assert.equal(ready.autoplay, false);
    assert.equal(ready.duration, 2);
    assert.equal(ready.messages, messages);
    assert.equal(ready.focusInCard, true);
    assert.equal(await ev(`document.activeElement.textContent.trim()`), 'Open large');
    pass('second Retry renders for real and plays paused inline; no learner message added', ready);

    await ev(
      `${card(lost.id)}.scrollIntoView({block:'center'}); ${card(lost.id)}.querySelector('button').focus(); true`,
    );
    await b('press', 'Enter');
    await wait(`${card(lost.id)}.dataset.state==='pending'`);
    server.send('render');
    await wait(`${card(lost.id)}.dataset.state==='ready'`, '120000');
    await wait(`${card(lost.id)}.querySelector('video')?.readyState>=1`);
    assert.ok(existsSync(join(dir, 'videos', `${lost.id}.mp4`)));
    assert.deepEqual(calls(), ['worker', 'worker', 'worker']);
    pass(
      'Regenerate replaces the unavailable entry with a ready video; only isolated worker calls, no tutor calls',
      { providerCalls: calls() },
    );
    await ev(`${card(failed.id)}.querySelector('button').focus()`);
    await b('press', 'Enter');
    await wait(`${card(failed.id)}.dataset.state==='pending'`);
    // Wait until the request actually reaches the controlled renderer before releasing it.
    await wait(
      `document.querySelectorAll('.focused-chat .video-card[data-state=pending]').length===1`,
    );
    await new Promise((r) => setTimeout(r, 300));
    server.send('render');
    await wait(`${card(failed.id)}.dataset.state==='ready'`, '120000');
    assert.deepEqual(calls(), ['worker', 'worker', 'worker', 'worker']);
    pass('failure Retry is keyboard accessible and makes one new worker attempt');
    await ev(`${card(lost.id)}.scrollIntoView({block:'center'})`);
    await b('screenshot', join(process.cwd(), '.impeccable/review/video-recovery.png'));

    writeFileSync(
      'docs/verification/smart-video-recovery.json',
      JSON.stringify(
        {
          checkedAt: new Date().toISOString(),
          evidence:
            'Synthetic tutor and worker providers; real sandboxed Remotion renders, production build, HTTP, SQLite and headless Chrome. No native provider inference.',
          checks,
        },
        null,
        2,
      ) + '\n',
    );
  } finally {
    await b('close').catch(() => {});
    server.send('stop');
  }
}
