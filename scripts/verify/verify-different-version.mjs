// Focused built-UI check for Try a different version (TreeTutor-zhf.7): synthetic providers, isolated temporary data, agent-browser.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';
import { fakeNarration } from '../../test/fake-narration.mjs';

const dir = mkdtempSync(join(tmpdir(), 'tt-different-version-')),
  store = new Store(join(dir, 'trees.sqlite'));
const task = {
  title: 'Winners advance',
  description: 'Two winners meet in the final.',
  intent: 'Show two winners meeting.',
  excerpt: 'Winners advance.',
};
const fence = (kind) => '\n```treetutor-' + kind + '\n' + JSON.stringify(task) + '\n```';
const svg = (text) =>
  `<svg viewBox="0 0 400 60" role="img" aria-label="${text}"><text x="8" y="36" fill="var(--color-text-primary)">${text}</text></svg>`;
const composition = `// Description: Two boxes slide together.
// Narration: "Winners advance."
import { AbsoluteFill } from 'remotion';
export const durationInFrames = 30;
export default function Video() { return <AbsoluteFill>A + B → Final</AbsoluteFill>; }`;
const mp4 = Buffer.concat([
  Buffer.from([0, 0, 0, 24]),
  Buffer.from('ftypisom'),
  Buffer.alloc(4096, 1),
]);
const complete = (emit, text) => {
  emit({ type: 'item', item: 'a', text });
  emit({ type: 'status', status: 'completed' });
};
let versions = 0,
  release;
const provider = {
  models: async () => [{ model: 'fixture', isDefault: true }],
  generate: async (tree, text, emit) => {
    if (tree.instructions?.includes('Remotion')) return complete(emit, composition);
    if (tree.instructions?.startsWith('You create one self-contained visual')) {
      if (versions++)
        await new Promise((r) => {
          release = r;
        });
      return complete(emit, svg(versions > 1 ? 'Second version' : 'First version'));
    }
    complete(
      emit,
      /video/.test(text)
        ? 'Here it is.' + fence('video') + '\n\nAfter the video.'
        : 'Winners advance in rounds.' + fence('visual') + '\n\nThe final decides.',
    );
  },
};
const app = createApp({
  store,
  provider,
  dir,
  videoRender: async (_w, output) => {
    writeFileSync(output, mp4);
    return { durationInFrames: 60, fps: 30 };
  },
  videoNarrate: fakeNarration,
  auth: { status: () => ({ connected: true }) },
});
await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${app.server.address().port}`,
  { csrf } = await (await fetch(origin + '/api/state')).json();
const post = (path, body = {}) =>
  fetch(origin + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf },
    body: JSON.stringify(body),
  });
const run = promisify(execFile),
  session = `different-version-${process.pid}`;
const b = async (...args) =>
  (await run('agent-browser', ['--session', session, ...args], { maxBuffer: 4 << 20 })).stdout;
const ev = async (expression) => JSON.parse(await b('eval', expression, '--json')).data.result;
const wait = (expression) => b('wait', '--fn', expression, '--timeout', '20000');
const shots = join(process.cwd(), '.impeccable/review');
mkdirSync(shots, { recursive: true });
const checks = [],
  pass = (name, detail) => {
    checks.push({ name, pass: true, ...(detail && { detail }) });
    console.log('PASS:', name);
  };
// Headless Chrome reports hover: none; run with a mouse: AGENT_BROWSER_HEADED=1 xvfb-run -a node scripts/verify/verify-different-version.mjs
const opacity = (selector) =>
  ev(`+getComputedStyle(document.querySelector(${JSON.stringify(selector)})).opacity`);
try {
  assert.equal(
    (
      await post('/api/settings/smart', {
        model: { provider: 'codex', model: 'fixture' },
        followEffort: false,
        effort: null,
      })
    ).status,
    200,
  );
  const tree = store.create('Different version', 'codex', 'fixture');
  await (await post(`/api/trees/${tree.id}/messages`, { text: 'How do tournaments work?' })).text();
  await (
    await post(`/api/trees/${tree.id}/messages`, { text: 'Make a video of the winners advancing.' })
  ).text();
  const [visual, video] = store.tree(tree.id).artifacts;
  for (let i = 0; i < 200 && store.artifact(tree.id, video.id).status !== 'ready'; i++)
    await new Promise((r) => setTimeout(r, 25));
  assert.equal(visual.status, 'ready', visual.error);
  assert.equal(
    store.artifact(tree.id, video.id).status,
    'ready',
    store.artifact(tree.id, video.id).error,
  );

  for (const [appearance, width] of [
    ['dark', 1280],
    ['light', 760],
  ]) {
    await b('set', 'viewport', '1280', '900');
    await b('open', origin);
    await ev(`localStorage.setItem('treetutor.appearance', '${appearance}'); true`);
    await b('reload');
    await b('wait', '[aria-label="Open Different version"]');
    await b('find', 'role', 'button', 'click', '--name', 'Open Different version', '--exact');
    await b('set', 'viewport', String(width), '900');
    const fig = `.focused-chat figure.visual[data-state=ready]`,
      card = `.focused-chat .video-inline[data-state=ready]`;
    await wait(
      `!!document.querySelector('${fig} iframe[data-ready]') && !!document.querySelector('${card}')`,
    );
    await ev('document.activeElement.blur(); true');
    await b('mouse', 'move', '0', '0');
    assert.equal(
      await ev(`matchMedia('(hover: hover)').matches`),
      true,
      'needs a mouse-capable browser (see header)',
    );
    assert.equal(await opacity(`${fig} .visual-actions`), 0, 'visual control hidden at rest');
    assert.equal(await opacity(`${card} .video-controls`), 0, 'video control hidden at rest');
    // Synthetic CDP moves over the cross-origin frame do not update parent :hover, so hover the figure's own action area.
    await b('hover', `${fig} .visual-actions`);
    assert.equal(await opacity(`${fig} .visual-actions`), 1, 'hover reveals the visual control');
    await b('hover', `${card} video`);
    assert.equal(await opacity(`${card} .video-controls`), 1, 'hover reveals the video control');
    await b('mouse', 'move', '0', '0');
    assert.equal(await opacity(`${card} .video-controls`), 0);
    // Keyboard: the control is a native focusable button; focusing it alone reveals it.
    const visualButton = `${fig} button[aria-label^="Try a different version of visual"]`;
    await ev(`document.querySelector('${visualButton}').focus(); true`);
    assert.equal(
      await ev(
        `document.activeElement.matches('${visualButton}') && document.activeElement.tabIndex >= 0`,
      ),
      true,
    );
    assert.equal(await opacity(`${fig} .visual-actions`), 1, 'focus reveals the visual control');
    await b('screenshot', join(shots, `different-version-visual-${appearance}.png`));
    await b('press', 'Enter');
    await wait(
      `document.querySelector('.focused-chat figure.visual')?.dataset.state === 'pending'`,
    );
    release();
    await wait(`!!document.querySelector('${fig} iframe[data-ready]')`);
    const after = store.tree(tree.id).artifacts.filter((a) => a.kind === 'visual');
    assert.equal(after.length, 1);
    assert.equal(after[0].id, visual.id);
    assert.match(after[0].source, /Second version/);
    assert.ok(
      await ev(
        `document.querySelector('.focused-chat figure.visual').contains(document.activeElement)`,
      ),
      'focus stays with the visual',
    );
    pass(
      `${appearance} ${width}px: visual control appears on hover/focus only; Enter replaces the visual in place and keeps focus`,
    );

    const videoButton = `${card} button[aria-label^="Try a different version of video"]`,
      before = store.tree(tree.id).artifacts.find((a) => a.kind === 'video');
    await ev(`document.querySelector('${videoButton}').focus(); true`);
    assert.equal(await opacity(`${card} .video-controls`), 1, 'focus reveals the video control');
    await b('screenshot', join(shots, `different-version-video-${appearance}.png`));
    await b('press', 'Enter');
    await wait(
      `document.querySelectorAll('.focused-chat .video-inline').length === 1 && document.querySelector('.focused-chat .video-inline[data-state=ready] video') && !document.querySelector('.focused-chat [data-artifact="${before.id}"]')`,
    ).catch(async (e) => {
      console.log(
        'diagnostics',
        JSON.stringify(store.tree(tree.id).artifacts.map((a) => [a.id, a.kind, a.status, a.error])),
        await ev(`document.activeElement.outerHTML.slice(0,120)`),
        await ev(
          `[...document.querySelectorAll('.focused-chat .video-inline')].map(v=>v.outerHTML.slice(0,200))`,
        ),
      );
      throw e;
    });
    const library = await (await fetch(origin + '/api/videos')).json(),
      current = store.tree(tree.id).artifacts.filter((a) => a.kind === 'video');
    assert.equal(current.length, 1);
    assert.notEqual(current[0].id, before.id);
    assert.ok(
      library.some((v) => v.id === before.id) && library.some((v) => v.id === current[0].id),
    );
    pass(
      `${appearance} ${width}px: video control on focus; Enter makes a new video, the chat shows only the newest, the library keeps the previous`,
      { library: library.length },
    );
  }
  console.log(
    JSON.stringify(
      {
        issue: 'TreeTutor-zhf.7',
        evidence: 'Synthetic providers, isolated temporary SQLite, built UI, agent-browser.',
        checks,
      },
      null,
      2,
    ),
  );
} finally {
  release?.();
  await b('close').catch(() => {});
  await app.stop();
  store.close();
}
