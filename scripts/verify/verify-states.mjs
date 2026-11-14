// Paperback States: real built UI/HTTP/SQLite; synthetic providers, study and local MP4.
// Fault injection is at fetch for loading/saving; native inference is not exercised.
import { verifyOut } from './lib/output.mjs';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  run,
  dir,
  b,
  ev,
  wait,
  click,
  shots,
  checks,
  pass,
  shot,
  token,
  contrasts,
  trapped,
  store,
  flags,
  calls,
  releaseFirst,
  provider,
  app,
  origin,
  open,
} from './lib/states-fixture.mjs';

try {
  await b('set', 'viewport', '1440', '900');
  await b('set', 'media', 'dark', 'reduced-motion');
  await b('open', origin);
  for (const mode of ['dark', 'light']) {
    await ev(`localStorage.setItem('treetutor.appearance','${mode}')`);
    await b('reload');
    await wait(
      `document.querySelector('.first-question [aria-label="Your question"]:not([aria-disabled=true])') && document.querySelector('.model-picker')`,
    );
    assert.equal(store.list().length, 0, 'opening first run creates no saved learning tree');
    assert.equal(
      await ev(
        `Math.round(document.querySelector('.first-question .astryx-chat-composer').getBoundingClientRect().width)`,
      ),
      560,
    );
    await shot(`first-run-${mode}`);
    await b('click', '.tree-switcher');
    await wait(`document.querySelector('.library-panel .first-question .model-picker')`);
    await click('Model for next reply');
    await wait(`document.querySelector('[role=menu]')`);
    await wait(
      `[...document.querySelectorAll('[role=menuitemradio]')].some(e=>e.checkVisibility()&&e.textContent.trim()==='Second model')`,
    );
    await b('find', 'role', 'menuitemradio', 'click', '--name', 'Second model', '--exact');
    await b('press', 'Escape');
    await wait(`![...document.querySelectorAll('[role=menu]')].some(e=>e.checkVisibility())`);
    assert.match(
      await ev(`document.querySelector('.library-panel .chat-model').textContent`),
      /Second model/,
    );
    assert.equal(store.list().length, 0);
    pass(`${mode}: first-run field and model menu in Read and Library without an empty saved tree`);
  }
  // An available local choice must work even when the Settings default disappeared.
  const savedDefault = { provider: 'claude', model: 'removed-model', effort: null };
  store.saveChatSettings(savedDefault);
  await b('reload');
  await wait(
    `document.querySelector('.model-picker') && document.querySelector('.chat-model').textContent.includes('removed-model')`,
  );
  await click('Model for next reply');
  await wait(
    `[...document.querySelectorAll('[role=menuitemradio]')].some(e=>e.checkVisibility()&&e.textContent.trim()==='Second model')`,
  );
  await b('find', 'role', 'menuitemradio', 'click', '--name', 'Second model', '--exact');
  await b('press', 'Escape');
  await b('click', '.tree-switcher');
  await wait(`document.querySelector('.library-panel .first-question .model-picker')`);
  // Failed create retains the first question. Retry creates once and sends through the selected model.
  await ev(
    `window.nativeFetch=window.fetch; window.failCreate=true; window.fetch=(u,o)=>String(u)==='/api/trees'&&window.failCreate?Promise.reject(new Error('Synthetic create failure')):window.nativeFetch(u,o)`,
  );
  await b('find', 'role', 'textbox', 'fill', '--name', 'Your question', 'How do fungi trade?');
  await b('press', 'Enter');
  await wait(
    `document.querySelector('.library-panel [role=alert]')?.textContent.includes('Synthetic create failure')`,
  );
  assert.equal(store.list().length, 0);
  assert.equal(
    await ev(`document.querySelector('.library-panel [aria-label="Your question"]').textContent`),
    'How do fungi trade?',
  );
  flags.holdFirst = true;
  await ev(`window.failCreate=false`);
  await b('find', 'role', 'textbox', 'click', '--name', 'Your question');
  await b('press', 'Enter');
  await wait(
    `document.querySelector('.focused-chat .reply-md')?.textContent.includes('A saved fixture answer.')`,
  );
  assert.match(
    await ev(`document.querySelector('.focused-chat .chat-model').textContent`),
    /Second model/,
    'selected model is visible while the first reply streams',
  );
  assert.ok(await ev(`!!document.querySelector('.reply-status[data-status=streaming]')`));
  assert.deepEqual({ ...store.chatSettings() }, savedDefault);
  flags.holdFirst = false;
  releaseFirst();
  await wait(`!document.querySelector('.reply-status[data-status=streaming]')`);
  assert.equal(store.list().length, 1);
  const root = store.tree(store.list()[0].id);
  assert.equal(root.model, 'second');
  assert.equal(root.messages.length, 2);
  assert.equal(calls, 1);
  pass(
    'first-run failed create preserves draft; chosen model overrides unavailable default, is correct while streaming, saves once and leaves Settings unchanged',
  );
  const source = root.messages[1].id;
  const child = store.branch(
    root,
    { messageId: source, start: 2, end: 7, text: 'saved', question: 'What do fungi exchange?' },
    'The learner asked about fungi trading with plants. This fixed snapshot supplies background without answering the child question.',
  );
  store.message(child.id, 'user', 'Show trade states.', 'completed');
  const reply = store.message(
    child.id,
    'assistant',
    'Roots exchange sugar for nutrients. Predict the effect of more phosphorus before revealing the answer.',
    'completed',
  );
  const visual = store.pendingArtifact(
    child.id,
    reply,
    'Trade check',
    'Predict how sugar payment changes.',
    'visual',
    null,
    0,
  );
  store.finishArtifact(
    child.id,
    visual.id,
    `<section aria-label="Check yourself"><h3>Check yourself</h3><p>If soil phosphorus doubled, what would happen to the sugar the plant sends?</p><details><summary>Reveal answer</summary><p>The plant would send less sugar.</p></details></section><script>const d=document.querySelector('details'),s=d.querySelector('summary');const report=()=>parent.postMessage({type:'statesQuiz',open:d.open,focus:document.activeElement===s,outline:getComputedStyle(s).outlineStyle},'*');s.addEventListener('focus',report);d.addEventListener('toggle',report);</script>`,
  );
  const diagram = store.pendingArtifact(
    child.id,
    reply,
    'Trade loop',
    'Sugar flows to fungi; nutrients flow to roots.',
  );
  store.finishArtifact(
    child.id,
    diagram.id,
    'flowchart LR\nA[Root] -->|sugar| B[Fungus]\nB -->|phosphorus| A',
  );
  const video = store.pendingArtifact(
    child.id,
    reply,
    'One exchange',
    'A two-second local playback fixture.',
    'video',
  );
  mkdirSync(join(dir, 'videos'));
  await run('ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=c=0x1a1613:s=640x360:d=2',
    '-vf',
    "drawtext=text='Root  >  Fungus':fontcolor=0xefe6d6:fontsize=32:x=(w-tw)/2:y=(h-th)/2",
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    join(dir, 'videos', `${video.id}.mp4`),
  ]);
  store.finishVideo(child.id, video.id, video.attempt, {
    description: video.description,
    duration: 2,
  });
  const brokenVisual = store.pendingArtifact(
    child.id,
    reply,
    'Failed visual',
    'Visual failure fixture.',
    'visual',
  );
  store.finishArtifact(child.id, brokenVisual.id, null, 'The visual could not be drawn.');
  const brokenDiagram = store.pendingArtifact(
    child.id,
    reply,
    'Failed diagram',
    'Diagram failure fixture.',
  );
  store.finishArtifact(child.id, brokenDiagram.id, null, 'The diagram source has an error.');
  const brokenVideo = store.pendingArtifact(
    child.id,
    reply,
    'Failed video',
    'Video failure fixture.',
    'video',
  );
  store.finishVideo(
    child.id,
    brokenVideo.id,
    brokenVideo.attempt,
    {},
    'Video narration timed out.',
  );
  const canceled = store.pendingArtifact(
    child.id,
    reply,
    'Canceled video',
    'Canceled fixture.',
    'video',
  );
  store.cancelVideo(child.id, canceled.id);
  store.message(child.id, 'user', 'Keep the stopped reply.', 'completed');
  const stopped = store.message(
    child.id,
    'assistant',
    'Some trade survives in rich soil.',
    'interrupted',
  );
  store.update(stopped, 'Some trade survives in rich soil.', 'interrupted', 'learner');
  store.message(child.id, 'user', 'Try another reply.', 'completed');
  store.message(child.id, 'assistant', 'Partial failed reply remains readable.', 'failed');
  store.layout(root.id, { folded: [], selected: child.id, panel: 'beside' });
  store.addGraph(
    {
      concepts: [
        { name: 'Hyphae', topics: ['Fungi'] },
        { name: 'Fungal threads', topics: ['Fungi'] },
      ],
      links: [],
    },
    reply,
  );
  const at = (id) => `[data-artifact="${id}"]`;
  for (const mode of ['dark', 'light']) {
    await open(mode, child.title);
    await click(`Inherited from ${root.title}`);
    await wait(`document.querySelector('.inherited-body')?.checkVisibility()`);
    const ink = await ev(
      `(() => { ${token} return {actual:getComputedStyle(document.querySelector('.inherited-body dd')).borderLeftColor,expected:token('--treetutor-ink-1')}; })()`,
    );
    assert.equal(ink.actual, ink.expected);
    await ev(`document.querySelector('.inherited-context').scrollIntoView({block:'center'})`);
    await shot(`context-${mode}`);
    await click('More conversation options');
    await wait(`document.querySelector('[role=menu]')`);
    await shot(`conversation-menu-${mode}`);
    await b('press', 'Escape');
    await wait(`document.activeElement?.getAttribute('aria-label')==='More conversation options'`);
    await ev(
      `document.querySelector('${at(visual.id)}').scrollIntoView({block:'center'});window.statesQuiz=null;addEventListener('message',e=>{if(e.data?.type==='statesQuiz')window.statesQuiz=e.data})`,
    );
    await wait(`document.querySelector('.visual-frame[data-ready]')`);
    await b('focus', '.visual-frame');
    await b('press', 'Tab');
    await wait(`window.statesQuiz?.focus`);
    assert.equal(await ev(`window.statesQuiz.open`), false);
    await shot(`check-before-reveal-${mode}`);
    await b('press', 'Enter');
    await wait(`window.statesQuiz?.open`);
    assert.equal(await ev(`window.statesQuiz.outline`), 'solid');
    await click('Enlarge visual: Trade check');
    await wait(`document.querySelector('.visual-viewer[open] .visual-frame[data-ready]')`);
    assert.match(
      await ev(`document.querySelector('.visual-viewer').textContent`),
      /Trade check.*Predict/s,
    );
    await shot(`visual-viewer-${mode}`);
    await trapped('.visual-viewer[open]');
    await b('press', 'Escape');
    await wait(`!document.querySelector('.visual-viewer[open]')`);
    assert.equal(
      await ev(`document.activeElement.getAttribute('aria-label')`),
      'Enlarge visual: Trade check',
    );
    await ev(`document.querySelector('${at(diagram.id)}').scrollIntoView({block:'center'})`);
    await wait(`document.querySelector('.diagram-card img')?.naturalWidth>0`);
    await click('Open diagram large: Trade loop');
    await wait(`document.querySelector('.astryx-lightbox[open]')`);
    await shot(`diagram-viewer-${mode}`);
    await trapped('.astryx-lightbox[open]');
    await b('press', 'Escape');
    await wait(`!document.querySelector('.astryx-lightbox[open]')`);
    assert.equal(
      await ev(`document.activeElement.getAttribute('aria-label')`),
      'Open diagram large: Trade loop',
    );
    await ev(`document.querySelector('${at(video.id)}').scrollIntoView({block:'center'})`);
    await click('Open large');
    await wait(`document.querySelector('.astryx-lightbox[open] video')`);
    await shot(`video-viewer-${mode}`);
    await trapped('.astryx-lightbox[open]');
    await b('press', 'Escape');
    await wait(`!document.querySelector('.astryx-lightbox[open]')`);
    assert.equal(await ev(`document.activeElement.textContent.trim()`), 'Open large');
    await ev(`document.querySelector('${at(brokenVideo.id)}').scrollIntoView({block:'center'})`);
    await shot(`media-failures-${mode}`);
    const failures = await ev(
      `(() => { ${token} return [...document.querySelectorAll('.focused-chat .visual[data-state=failed],.focused-chat .diagram-card[data-state=failed],.focused-chat .video-card[data-state=failed] .video-controls')].map(e=>({border:getComputedStyle(e).borderTopColor,expected:token('--color-border-error'),retry:!!e.querySelector('button')})); })()`,
    );
    assert.equal(failures.length, 3);
    assert.ok(failures.every((f) => f.border === f.expected && f.retry));
    assert.equal(
      await ev(
        `getComputedStyle(document.querySelector('${at(canceled.id)} .video-controls')).borderTopWidth`,
      ),
      '0px',
    );
    await ev(
      `document.querySelector('.reply-status[data-status=failed]').scrollIntoView({block:'center'})`,
    );
    await shot(`replies-${mode}`);
    assert.equal(
      await ev(
        `[...document.querySelectorAll('.focused-chat button')].filter(e=>e.textContent.trim()==='Retry reply').length`,
      ),
      1,
    );
    const ratios = await contrasts(
      '.failure-banner .astryx-text,.visual[data-state=failed] .astryx-text,.diagram-card[data-state=failed] .astryx-text,.video-card[data-state=failed] .astryx-text,.reply-status',
    );
    assert.ok(ratios.length);
    for (const r of ratios) assert.ok(r.ratio >= 4.5, `${mode}: ${JSON.stringify(r)}`);
    pass(
      `${mode}: inherited ink, conversation menu, native check reveal, three viewers/focus return, failed artifacts/replies, neutral cancellation and AA contrast`,
      { ink, failures, ratios },
    );
    // Hold one actual tree read to inspect the skeleton; then fail that request and recover with its Retry.
    await ev(
      `window.savedFetch=window.fetch;window.fetch=(u,o)=>String(u)==='/api/trees/${root.id}'?new Promise((resolve,reject)=>window.rejectTree=()=>reject(new Error('Synthetic tree read failure'))):window.savedFetch(u,o)`,
    );
    await click('Return to parent conversation');
    await wait(`document.querySelector('.tree-loading')`);
    assert.ok(
      await ev(
        `document.querySelector('.tree-loading').getBoundingClientRect().width > 250 && [...document.querySelectorAll('.tree-loading .astryx-skeleton')].every(e=>e.getBoundingClientRect().width>100&&e.getBoundingClientRect().height>=14)`,
      ),
    );
    await shot(`loading-${mode}`);
    assert.equal(await ev(`document.querySelectorAll('.tree-loading .astryx-skeleton').length`), 4);
    await ev(`window.rejectTree()`);
    await wait(
      `[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Retry loading tree')`,
    );
    await shot(`tree-load-failure-${mode}`);
    await ev(`window.fetch=window.savedFetch`);
    await click('Retry loading tree');
    await wait(
      `document.querySelector('.focused-chat h2')?.textContent===${JSON.stringify(root.title)}`,
    );
    // Model fetch fails visibly and clears on retry.
    await ev(
      `window.fetch=(u,o)=>String(u)==='/api/models'?Promise.reject(new Error('Synthetic model read failure')):window.savedFetch(u,o)`,
    );
    await click('Model for next reply');
    await wait(
      `document.querySelector('.failure-banner')?.textContent.includes('Synthetic model read failure')`,
    );
    await b('press', 'Escape');
    await shot(`model-load-failure-${mode}`);
    await ev(`window.fetch=window.savedFetch`);
    await click('Retry loading models');
    await wait(`!document.querySelector('.failure-banner')`);
    // Trigger the app's real layout saver on its controlled minute and retry the failed write.
    await ev(
      `window.fetch=(u,o)=>String(u).endsWith('/layout')?Promise.resolve(new Response('{"error":"Synthetic layout write failure"}',{status:500,headers:{'Content-Type':'application/json'}})):window.savedFetch(u,o)`,
    );
    await click('Expand chat');
    await ev(`__layoutMinute()`);
    await wait(`document.querySelector('.band-save')`);
    await shot(`save-failure-${mode}`);
    await ev(`window.fetch=window.savedFetch`);
    await click('Retry saving layout');
    await wait(`!document.querySelector('.band-save')`);
    pass(`${mode}: tree skeleton/read failure/retry, model load failure/retry, save failure/retry`);
    await click('Knowledge');
    await wait(`document.querySelector('[data-concept="Hyphae"]')`);
    await b('click', '[data-concept="Hyphae"]');
    await click('Merge Hyphae…');
    await wait(`document.querySelector('dialog[open]')`);
    await shot(`merge-${mode}`);
    await trapped('dialog[open]');
    await b('press', 'Escape');
    await wait(`!document.querySelector('dialog[open]')`);
    assert.equal(await ev(`document.activeElement.getAttribute('aria-label')`), 'Merge Hyphae…');
    await b('click', '.tree-switcher');
    await wait(`document.querySelector('[aria-label="Actions for ${root.title}"]')`);
    await click(`Actions for ${root.title}`);
    await wait(`document.querySelector('[role=menu]')`);
    await shot(`tree-menu-${mode}`);
    await b('press', 'Escape');
    pass(`${mode}: merge dialog closes to opener and Library tree menu remains reachable`);
  }
  // Narrow failure controls stay within their card; keep the larger-viewer checks at desktop.
  for (const mode of ['dark', 'light']) {
    await b('set', 'viewport', '390', '844');
    await open(mode, child.title);
    await ev(`document.querySelector('${at(brokenVideo.id)}').scrollIntoView({block:'center'})`);
    const fits = await ev(
      `(() => {const c=document.querySelector('${at(brokenVideo.id)} .video-controls'),r=c.getBoundingClientRect();return [...c.children].every(e=>{const b=e.getBoundingClientRect();return b.left>=r.left&&b.right<=r.right&&b.top>=r.top&&b.bottom<=r.bottom;});})()`,
    );
    assert.ok(fits);
    await shot(`failures-narrow-${mode}`);
  }
  pass('390px: failed video reason and Retry fit in both appearances');
  flags.noModels = true;
  await b('set', 'viewport', '1440', '900');
  await open('dark', child.title);
  assert.equal(
    await ev(`document.querySelector('.focused-chat [aria-label="Send"]').disabled`),
    true,
  );
  await click('Model for next reply');
  await wait(
    `[...document.querySelectorAll('[role=menuitem]')].some(e=>e.checkVisibility()&&e.textContent.includes('Continue with ChatGPT'))`,
  );
  pass('no available model disables Send while recovery/model menu stays usable');
} catch (e) {
  console.log(await b('snapshot', '-i'));
  await b('screenshot', '/tmp/tt-states-debug.png');
  throw e;
} finally {
  await b('close').catch(() => {});
  app.stop();
  store.close();
}
writeFileSync(
  `${verifyOut}/states-results.json`,
  JSON.stringify(
    {
      issue: 'TreeTutor-y36.10',
      evidence:
        'Built UI, Chromium, isolated HTTP/SQLite; synthetic study/providers, local ffmpeg MP4 and controlled fetch failures. No native provider inference.',
      checks,
      screenshots: shots,
    },
    null,
    2,
  ) + '\n',
);
