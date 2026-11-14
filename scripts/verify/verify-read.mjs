// Read mockup acceptance: built app, SQLite/HTTP/SSE and Chromium, synthetic providers.
// The tiny playable MP4 is a local ffmpeg fixture; this does not verify native model/media generation.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';
import { fakeNarration } from '../../test/fake-narration.mjs';
import { nestedFrames } from '../../test/one-frame.mjs';

const run = promisify(execFile),
  dir = mkdtempSync(join(tmpdir(), 'tt-read-'));
const session = (
  await run('agent-browser', ['session', 'id', '--scope', 'worktree', '--prefix', 'read'])
).stdout.trim();
const b = async (...args) =>
  (await run('agent-browser', ['--session', session, ...args], { maxBuffer: 8 << 20 })).stdout;
const ev = async (code) => JSON.parse(await b('eval', code, '--json')).data.result;
const wait = (code) => b('wait', '--fn', `!!(${code})`);
const click = (name) => b('find', 'role', 'button', 'click', '--name', name, '--exact');
const steps = [],
  screenshots = [];
const check = (name, evidence) => {
  steps.push({ name, evidence });
  console.log('PASS:', name);
};
const store = new Store(join(dir, 'data.sqlite'));
const root = store.create('How do fungi trade?');
store.message(root.id, 'user', root.title, 'completed');
const parentReply = store.message(
  root.id,
  'assistant',
  'Plants and fungi trade sugar for phosphorus.',
  'completed',
);
const tree = store.branch(
  store.tree(root.id),
  {
    messageId: parentReply,
    start: 0,
    end: 16,
    text: 'Plants and fungi',
    question: 'Why trade at all?',
  },
  'The learner is exploring an exchange of sugar for phosphorus between plant roots and fungi.',
);
store.message(tree.id, 'user', tree.title, 'completed');
const text =
  'Neither partner can make what the other offers. A plant fixes carbon from air and light, but its roots touch only a thin sleeve of soil. A fungus cannot photosynthesise, yet its threads reach phosphorus the plant never could. Could either manage without the other? Rarely, and poorly.\n\n### What each side pays\n\n- The plant pays in sugar, up to a fifth of what it makes.\n- The fungus pays in phosphorus and water.\n\n```js\nconst trade = { give: "sugar", get: "phosphorus" };\n```\n\n| Partner | Has in surplus | Lacks |\n| --- | --- | --- |\n| Plant | Sugar | Phosphorus |\n| Fungus | Phosphorus | Sugar |';
const reply = store.message(tree.id, 'assistant', text, 'completed');
store.usage(reply, { input: 1200, output: 300, cacheRead: 800 });
store.pendingSuggestions(tree.id, reply);
store.finishSuggestions(
  tree.id,
  reply,
  [
    {
      start: text.indexOf('fixes carbon'),
      end: text.indexOf('fixes carbon') + 12,
      text: 'fixes carbon',
    },
  ],
  null,
);
store.branch(
  store.tree(tree.id),
  {
    messageId: reply,
    start: text.indexOf('manage without the other'),
    end: text.indexOf('manage without the other') + 24,
    text: 'manage without the other',
    question: 'Could a plant go alone?',
  },
  'The partners exchange nutrients.',
);
const diagram = store.pendingArtifact(
  tree.id,
  reply,
  'Trade loop',
  'Sugar flows to the fungus; phosphorus flows to the root.',
);
store.finishArtifact(
  tree.id,
  diagram.id,
  'flowchart LR\n Root -->|sugar| Fungus\n Fungus -->|phosphorus| Root',
);
store.message(tree.id, 'user', 'Show me how much further hyphae reach than roots.', 'completed');
const mediaText =
  'A root hair reaches about two millimetres into the soil. Hyphae run for centimetres, so the same sugar buys far more surface.\n\nSelect the lower bar to branch from it, the same way you would from a passage.\n\nThen watch one exchange.';
const mediaReply = store.message(tree.id, 'assistant', mediaText, 'completed');
const visual = store.pendingArtifact(
  tree.id,
  mediaReply,
  'Reach of roots and hyphae',
  'Illustrative reach of roots and hyphae.',
  'visual',
  null,
  mediaText.indexOf('Select'),
);
store.finishArtifact(
  tree.id,
  visual.id,
  `<svg viewBox="0 0 640 150" role="img" aria-label="Illustrative reach: roots 2 millimetres, hyphae 140 millimetres"><g fill="var(--color-text-primary)" font-size="14"><text x="0" y="40">Roots alone</text><text x="0" y="100">With hyphae</text></g><rect x="130" y="20" width="64" height="28" fill="var(--treetutor-ink-1)"/><rect x="130" y="80" width="430" height="28" fill="var(--treetutor-ink-2)"/></svg><section aria-label="Check yourself"><h3>Check yourself</h3><p>If soil phosphorus doubled, what would happen to the sugar the plant sends?</p><details><summary>Reveal answer</summary><p>It would fall. The plant pays less when phosphorus is easy to find.</p></details></section><script>
const quiz = document.querySelector('details'), summary = quiz.querySelector('summary');
const report = () => parent.postMessage({ type: 'readQuiz', open: quiz.open, focused: document.activeElement === summary, outline: getComputedStyle(summary).outlineStyle }, '*');
quiz.addEventListener('toggle', report); summary.addEventListener('focus', report);
</script>`,
);
const video = store.pendingArtifact(
  tree.id,
  mediaReply,
  'The trade, narrated',
  'Illustrative video fixture, two seconds.',
  'video',
  null,
  mediaText.length,
);
mkdirSync(join(dir, 'videos'));
await run('ffmpeg', [
  '-v',
  'error',
  '-f',
  'lavfi',
  '-i',
  'color=c=0x14110e:s=640x360:d=2',
  '-vf',
  "drawtext=text='Root  >  Fungus':fontcolor=0xefe6d6:fontsize=32:x=(w-tw)/2:y=(h-th)/2",
  '-c:v',
  'libx264',
  '-pix_fmt',
  'yuv420p',
  join(dir, 'videos', `${video.id}.mp4`),
]);
store.finishVideo(tree.id, video.id, video.attempt, {
  description: video.description,
  duration: 2,
});
// Retry enters the real app job lifecycle; only the provider and renderer are controlled.
const pending = store.pendingArtifact(
  tree.id,
  mediaReply,
  'One exchange',
  'An exchange, step by step.',
  'video',
  JSON.stringify({
    request: 'Make a video of one exchange',
    intent: 'Animate an exchange.',
    excerpt: 'The partners trade nutrients.',
  }),
  mediaText.length,
);
store.finishVideo(tree.id, pending.id, pending.attempt, {}, 'Video rendering failed.');
let releaseTutor;
const provider = {
  models: async () => [{ model: 'fixture', label: 'Fixture model', isDefault: true }],
  generate: async (conversation, input, emit, _save, signal) => {
    if (conversation.instructions?.includes('Remotion')) {
      emit({
        type: 'item',
        item: 'one',
        text: '// Description: A root and a fungus exchange nutrients.\n// Narration: "Winners advance."\nimport { AbsoluteFill } from "remotion";\nexport const durationInFrames = 90;\nexport default function Video() { return <AbsoluteFill>Root and fungus</AbsoluteFill>; }',
      });
    } else if (conversation.instructions?.startsWith('You create one self-contained visual')) {
      await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
    } else {
      emit({
        type: 'item',
        item: 'one',
        text:
          'Start at the root surface. The fungus has wrapped a cortex cell.\n\n```treetutor-visual\n' +
          JSON.stringify({
            title: 'At the root',
            description: 'A visual still generating.',
            intent: 'Show the root surface.',
            excerpt: 'The fungus has wrapped a cortex cell.',
          }) +
          '\n```\n\nThe branched structure is called an arbuscule',
      });
      await new Promise((resolve) => {
        releaseTutor = resolve;
        signal.addEventListener('abort', resolve, { once: true });
      });
    }
    emit({ type: 'status', status: 'completed' });
  },
};
const app = createApp({
  store,
  dir,
  provider,
  auth: { status: () => ({ connected: true }) },
  videoNarrate: fakeNarration,
  videoRender: async (_workspace, _output, signal, progress) => {
    progress(0.42);
    await new Promise((_, reject) =>
      signal.addEventListener('abort', () => reject(signal.reason), { once: true }),
    );
  },
});
await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
const shot = async (name) => {
  const path = `docs/verification/read-${name}.png`;
  await ev(`document.activeElement.blur()`);
  await b('mouse', 'move', '5', '5');
  await wait(`![...document.querySelectorAll('[role=tooltip]')].some(e => e.checkVisibility())`);
  await b('screenshot', path);
  screenshots.push(path);
};
const top = () => ev(`document.querySelector('.focused-chat .astryx-chat-layout').scrollTo(0, 0)`);
// One frame per object: no frame inside a frame, and the reading surfaces sit on tone with no frame of their own.
const oneFrame = async (label) => {
  const nested = await ev(nestedFrames('.focused-chat, .contents, .band-drawer'));
  assert.deepEqual(nested, [], `${label}: frame inside a frame`);
  return nested;
};
const intoView = (selector) =>
  ev(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({ block: 'center' })`);
try {
  await b('set', 'viewport', '1440', '900');
  await b('open', `http://127.0.0.1:${app.server.address().port}`);
  await b('set', 'media', 'dark', 'reduced-motion');
  await b('wait', `[aria-label="Open ${tree.title}"]`);
  await b('focus', `[aria-label="Open ${tree.title}"]`);
  await b('press', 'Enter');
  await b('wait', '.visual');
  await intoView('.visual');
  await wait(
    `document.querySelector('.visual-frame[data-ready]') && document.querySelector('.diagram-card img')?.naturalWidth > 0 && document.querySelector('video')?.readyState >= 1`,
  );
  await b('snapshot', '-i');
  for (const mode of ['dark', 'light']) {
    if (mode === 'light') {
      await ev(`localStorage.setItem('treetutor.appearance', 'light'); location.reload()`);
      await b('wait', `[aria-label="Open ${tree.title}"]`);
      await b('focus', `[aria-label="Open ${tree.title}"]`);
      await b('press', 'Enter');
      await b('wait', '.visual');
      await intoView('.visual');
      await wait(
        `document.querySelector('.visual-frame[data-ready]') && document.querySelector('.diagram-card img')?.naturalWidth > 0`,
      );
    }
    await top();
    const geometry = await ev(
      `(() => { const r = s => document.querySelector(s).getBoundingClientRect(), p = document.querySelector('.reply-md'), c = document.createElement('canvas').getContext('2d'); c.font = getComputedStyle(p).fontSize + ' ' + getComputedStyle(p).fontFamily; return { map: r('#learning-tree-map').width, left: r('#learning-tree-map').left, chatRight: r('.focused-chat').right, prose: r('.passage').width, font: getComputedStyle(p).fontFamily, size: getComputedStyle(p).fontSize, leading: getComputedStyle(p).lineHeight, chars: r('.passage').width / c.measureText('0').width, composer: !!document.querySelector('.astryx-chat-composer .model-picker'), breadcrumbs: document.querySelector('.crumbs').innerText, chip: document.querySelector('.passage-address').textContent }; })()`,
    );
    assert.equal(Math.round(geometry.map), 440);
    assert.equal(geometry.left, geometry.chatRight);
    assert.equal(Math.round(geometry.prose), 640);
    assert.match(geometry.font, /Literata/);
    assert.equal(geometry.size, '17px');
    assert.equal(geometry.leading, '28.9px');
    assert.ok(
      geometry.chars >= 60 && geometry.chars <= 76,
      `typographic line measure ${geometry.chars}ch`,
    );
    assert.ok(geometry.composer);
    assert.match(geometry.breadcrumbs, /1.*How do fungi trade\?[\s\S]*1\.1.*Why trade at all\?/);
    assert.equal(geometry.chip, '1.1.1');
    check(
      `${mode}: 640px reading measure, 440px map on right, Literata 17/1.7, address breadcrumbs and composer model`,
      geometry,
    );
    await click('Token stats');
    await wait(`document.querySelector('.chat-stats-body')?.checkVisibility()`);
    assert.match(
      await ev(`document.querySelector('.chat-stats-body').textContent`),
      /1,200 input · 300 output · 800 cache-read tokens/,
    );
    await click('Token stats');
    await click('Inherited from How do fungi trade?');
    assert.equal(
      await ev(`document.querySelector('.inherited-body dd').textContent`),
      'Plants and fungi',
    );
    await click('Inherited from How do fungi trade?');
    await b('find', 'role', 'button', 'click', '--name', 'Mermaid source', '--exact');
    await wait(`document.querySelector('.diagram-source')?.checkVisibility()`);
    await oneFrame(`${mode} reading`);
    const surfaces =
      await ev(`(() => { const s = q => getComputedStyle(document.querySelector(q)); const frame = q => { const c = s(q); return [c.borderTopWidth, c.borderInlineStartWidth, c.boxShadow].join(' '); };
      return { inherited: frame('.inherited-context'), code: frame('.reply-md pre'), card: frame('.diagram-card'), source: frame('.diagram-source'), cell: [s('.reply-md td').borderTopWidth, s('.reply-md td').borderInlineStartWidth, s('.reply-md td').borderBottomWidth], contents: s('.contents-row[aria-current]').boxShadow, contentsFill: s('.contents-row[aria-current]').backgroundColor, chip: [s('.model-picker').borderTopWidth, s('.model-picker').boxShadow] }; })()`);
    for (const k of ['inherited', 'code', 'card', 'source'])
      assert.equal(surfaces[k], '0px 0px none', `${mode} ${k} carries no frame`);
    assert.deepEqual(
      surfaces.cell,
      ['0px', '0px', '1px'],
      `${mode} table rows are separated by one rule`,
    );
    assert.equal(surfaces.contents, 'none');
    assert.notEqual(
      surfaces.contentsFill,
      'rgba(0, 0, 0, 0)',
      `${mode} current Contents row is a fill`,
    );
    assert.deepEqual(surfaces.chip, ['0px', 'none'], `${mode} model chip has no outline`);
    await b('find', 'role', 'button', 'click', '--name', 'Mermaid source', '--exact');
    await b(
      'find',
      'role',
      'button',
      'click',
      '--name',
      'Inherited from How do fungi trade?',
      '--exact',
    );
    await wait(`document.querySelector('.inherited-body')?.checkVisibility()`);
    await ev(`document.querySelector('.reply-md u.suggestion[tabindex]').click(); true`);
    await wait(`document.querySelector('.branch-form input')`);
    // The field's focus ring is a focus outline, not a frame; check the resting form.
    await ev(`document.activeElement.blur(); true`);
    await oneFrame(`${mode} branch form`);
    const form = await ev(
      `(() => { const s = getComputedStyle(document.querySelector('.branch-form')); return { form: s.borderTopWidth, field: [...document.querySelectorAll('.branch-form *')].filter(e => { const c = getComputedStyle(e); return parseFloat(c.borderTopWidth) > 0 && !/, 0\\)$|transparent/.test(c.borderTopColor) || c.boxShadow !== 'none'; }).length }; })()`,
    );
    assert.deepEqual(form, { form: '1px', field: 0 }, `${mode} branch form shows one frame`);
    await b('focus', '.branch-form input');
    await b('press', 'Escape');
    await wait(`!document.querySelector('.branch-form')`);
    await click('Inherited from How do fungi trade?');
    check(
      `${mode}: one frame per object on Read (inherited context, code, diagram card and source, table, Contents row, model chip, branch form)`,
      { surfaces, form },
    );
    // Check actual composited theme colours for text, controls and paper focus on the reading surface.
    const contrasts = await ev(`(() => {
      const c = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
      const rgba = value => { c.clearRect(0, 0, 1, 1); c.fillStyle = value; c.fillRect(0, 0, 1, 1); return [...c.getImageData(0, 0, 1, 1).data]; };
      const blend = (fg, bg) => fg.slice(0, 3).map((v, i) => v * fg[3] / 255 + bg[i] * (1 - fg[3] / 255));
      const bg = node => { let chain = []; for (let e = node; e; e = e.parentElement) chain.unshift(e); return chain.reduce((acc, e) => blend(rgba(getComputedStyle(e).backgroundColor), acc), [255, 255, 255]); };
      const L = rgb => rgb.map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [.2126, .7152, .0722][i], 0);
      return ['.reply-md', '.question-bubble', '.reply-usage', '.reply-copy', '.model-picker', '.stats-toggle', '.inherited-context', '.code-copy', '.visual-actions button', '.video-controls button', '.chat-model', '.crumb', '.crumbs strong'].map(sel => { const e = document.querySelector(sel), back = bg(e), fg = blend(rgba(getComputedStyle(e).color), back), a = L(fg), b = L(back); return { sel, ratio: (Math.max(a,b)+.05)/(Math.min(a,b)+.05) }; });
    })()`);
    for (const c of contrasts) assert.ok(c.ratio >= 4.5, `${mode} ${c.sel}: ${c.ratio}`);
    await b('focus', '.stats-toggle');
    await b('press', 'Tab');
    const ring = await ev(
      `(() => { const s = getComputedStyle(document.activeElement), probe = document.createElement('i'); probe.style.color = 'var(--treetutor-paper)'; document.body.append(probe); const paper = getComputedStyle(probe).color; probe.remove(); return { width: s.outlineWidth, style: s.outlineStyle, color: s.outlineColor, paper }; })()`,
    );
    assert.equal(ring.color, ring.paper);
    assert.ok(parseFloat(ring.width) >= 2 && ring.style === 'solid');
    await b('press', 'Enter');
    await wait(`!document.querySelector('.chat-divider')`);
    await click('Show map beside chat');
    await wait(`document.querySelector('.chat-divider')`);
    check(
      `${mode}: measured text/control AA contrast, keyboard paper focus, token stats/context and map toggle`,
      { contrasts, ring },
    );
    await top();
    await b('mouse', 'move', '5', '5');
    await ev(`document.activeElement.blur()`);
    await shot(`${mode}`);
    await intoView('.diagram-card');
    await shot(`diagram-${mode}`);
    await intoView('.visual');
    await b('focus', '.stats-toggle');
    await b('press', 'Enter');
    await wait(
      `(() => { const r = document.querySelector('.chat-stats-body')?.getBoundingClientRect(); return r && r.top >= document.querySelector('.chat-header').getBoundingClientRect().bottom && r.bottom <= document.querySelector('.astryx-chat-composer').getBoundingClientRect().top; })()`,
    );
    assert.equal(
      await ev(`document.activeElement.matches('.stats-toggle')`),
      true,
      'opening stats from a later reply reveals them while keeping toggle focus',
    );
    await b('press', 'Enter');
    await intoView('.visual');
    const media = await ev(
      `(() => { const v = document.querySelector('.visual'), video = document.querySelector('.video-inline'); return { border: getComputedStyle(v).borderTopWidth, videoBorder: getComputedStyle(video).borderTopWidth, visibleTitles: [...video.querySelectorAll('h3')].filter(e => !e.classList.contains('sr-only')).length, paused: video.querySelector('video').paused, controls: video.querySelector('video').controls }; })()`,
    );
    // Videos carry a visible figure caption (docs/video-quality-spec.md, decision 12).
    assert.deepEqual(media, {
      border: '0px',
      videoBorder: '0px',
      visibleTitles: 1,
      paused: true,
      controls: true,
    });
    await ev(
      `window.__readQuiz = null; addEventListener('message', e => { if (e.data?.type === 'readQuiz') window.__readQuiz = e.data; }); true`,
    );
    await b('focus', '.visual-frame');
    await b('press', 'Tab');
    await wait(`window.__readQuiz?.focused`);
    await b('press', 'Enter');
    await wait(`window.__readQuiz?.open`);
    assert.equal(await ev(`window.__readQuiz.outline`), 'solid');
    await intoView('.visual');
    await shot(`media-${mode}`);
    check(
      `${mode}: borderless untitled visual, captioned video and native Check yourself reveal`,
      media,
    );
  }
  // Real SSE streaming and the renderer job phase, with controlled provider/renderer gates.
  await click('Retry video');
  await wait(
    `document.querySelector('.video-steps [data-step=active]')?.textContent.includes('Rendering frames')`,
  );
  await b(
    'find',
    'role',
    'textbox',
    'fill',
    '--name',
    'Your question',
    'Walk through one exchange',
  );
  await b('press', 'Enter');
  await wait(
    `document.querySelector('.reply-status[data-status=streaming]') && document.querySelector('.visual[data-state=pending]')`,
  );
  const streaming = await ev(
    `({ status: document.querySelector('.reply-status[data-status=streaming]').textContent, busy: document.querySelector('[role=log]').getAttribute('aria-busy'), skeleton: getComputedStyle(document.querySelector('.visual[data-state=pending] .visual-shimmer')).height, phase: document.querySelector('.video-inline[data-state=pending] [role=status]').textContent, stop: !!document.querySelector('[aria-label=Stop]'), modelDisabled: document.querySelector('.model-picker').matches(':disabled, [aria-disabled=true]') })`,
  );
  await oneFrame('streaming with Stop and failed video');
  assert.deepEqual(
    await ev(
      `(() => { const s = getComputedStyle(document.querySelector('[aria-label=Stop]')); return [s.borderTopWidth, s.boxShadow]; })()`,
    ),
    ['0px', 'none'],
    'Stop carries no outline in the composer',
  );
  assert.equal(streaming.status, 'Responding…');
  assert.equal(streaming.busy, 'true');
  assert.equal(streaming.skeleton, '180px');
  assert.match(streaming.phase, /Rendering frames…/);
  assert.ok(streaming.stop && streaming.modelDisabled, JSON.stringify(streaming));
  for (const mode of ['light', 'dark']) {
    await b('set', 'media', mode, 'reduced-motion');
    // Change the app appearance through its normal Settings control without reloading the stream.
    await click('Settings');
    await b(
      'find',
      'role',
      'radio',
      'click',
      '--name',
      mode[0].toUpperCase() + mode.slice(1),
      '--exact',
    );
    await b('press', 'Escape');
    await intoView('.visual[data-state=pending]');
    await shot(`streaming-${mode}`);
    await intoView('.video-inline[data-state=pending]');
    await shot(`status-${mode}`);
  }
  check(
    'SSE streaming, busy log, 180px pending visual, Stop and rendering step in the draft frame',
    streaming,
  );
  await click('Stop');
  await wait(`!document.querySelector('.reply-status[data-status=streaming]')`);
  await click('Cancel video');
  await wait(`document.querySelector('.video-inline[data-state=canceled]')`);
  await b('set', 'viewport', '390', '780');
  await intoView('.visual');
  await shot('narrow-dark');
  assert.ok(
    await ev(
      `document.documentElement.scrollWidth <= innerWidth && document.querySelector('.focused-chat').clientWidth === innerWidth && document.querySelector('[aria-label=Send]').getBoundingClientRect().right <= innerWidth`,
    ),
  );
  check('390px: full-width focused chat, composer/Send reachable, no document overflow');
  writeFileSync(
    'docs/verification/read-results.json',
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        evidence:
          'Built app, SQLite/HTTP/SSE, Chromium; synthetic providers, controlled renderer, local ffmpeg playback fixture. No native provider or narrated-generation claim.',
        pass: true,
        steps,
        screenshots,
      },
      null,
      2,
    ) + '\n',
  );
} catch (error) {
  await b('screenshot', '/tmp/read-failure.png').catch(() => {});
  throw error;
} finally {
  releaseTutor?.();
  await b('close').catch(() => {});
  await app.stop();
  store.close();
}
