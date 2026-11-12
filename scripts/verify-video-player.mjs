// Browser fixture for TreeTutor-vm4.10: video status sequence, keyboard playback, no stolen focus or scroll, reload.
// Synthetic tutor/worker providers; the composition is rendered for real in the bubblewrap sandbox. Needs `npm run build`.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { execFile, fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';
import { sandboxRender } from '../server/videos.mjs';
import { fakeNarration } from '../test/fake-narration.mjs';

const filename = fileURLToPath(import.meta.url);
const task = { title: 'Peterson in the tournament tree', description: 'Two threads meet at each tree level.', intent: 'Animate two winners advancing.', excerpt: 'Peterson locks guard each node.' };
const composition = `// Description: Two labelled boxes slide together into a final box over two seconds.
// Narration: "Winners advance."
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
export const durationInFrames = 90;
export default function Video() {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{ background: 'white', alignItems: 'center', justifyContent: 'center', fontSize: 40, opacity: interpolate(frame, [0, 30], [0, 1]) }}>A + B → Final</AbsoluteFill>;
}`;

if (process.argv[2] === '--serve') {
  const dir = process.argv[3], store = new Store(join(dir, 'trees.sqlite'));
  const gates = {};
  const gate = name => new Promise(resolve => { gates[name] = resolve; });
  const log = kind => appendFileSync(join(dir, 'calls.jsonl'), JSON.stringify({ kind }) + '\n');
  const done = (emit, text) => { emit({ type: 'item', item: 'answer', text }); emit({ type: 'status', status: 'completed' }); };
  const provider = {
    models: async () => [{ model: 'fixture-model', label: 'Fixture model', isDefault: true }],
    generate: async (tree, text, emit) => {
      if (tree.instructions?.includes('Remotion')) { log('worker'); await gate('compose'); return done(emit, composition); }
      log('tutor');
      done(emit, /video/i.test(text) ? 'Here is how Peterson fits.\n\n```treetutor-video\n' + JSON.stringify(task) + '\n```\n\nThen the winners advance.' : 'Continuing elsewhere.');
    },
  };
  const videoRender = async (workspace, output, signal, onProgress) => { onProgress(0.4); await gate('render'); return sandboxRender(workspace, output, signal, onProgress); };
  const app = createApp({ store, provider, dir, videoRender, videoNarrate: fakeNarration, auth: { status: () => ({ connected: true }) } });
  process.on('message', message => {
    if (gates[message]) gates[message]();
    if (message === 'stop') { app.stop(); store.close(); process.exit(0); }
  });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  process.send({ origin: `http://127.0.0.1:${app.server.address().port}` });
} else {
  const dir = mkdtempSync(join(tmpdir(), 'tt-video-browser-'));
  const store = new Store(join(dir, 'trees.sqlite'));
  const root = store.create('Mutual exclusion');
  store.message(root.id, 'user', 'How do locks scale?', 'completed');
  const rootReply = store.message(root.id, 'assistant', 'Peterson locks combine into a tournament tree.', 'completed');
  const child = store.branch(store.tree(root.id), { messageId: rootReply, start: 0, end: 8, text: 'Peterson', question: 'Peterson details' }, 'Root snapshot.');
  store.message(child.id, 'user', 'Peterson details', 'completed');
  const childReply = store.message(child.id, 'assistant', 'Each node is a two-thread Peterson lock.', 'completed');
  const nested = store.branch(store.tree(child.id), { messageId: childReply, start: 0, end: 9, text: 'Each node', question: 'Tree levels' }, 'Child snapshot.');
  const long = 'A thread climbs one level each time it wins its two-thread lock. '.repeat(12);
  for (let i = 0; i < 6; i++) { store.message(nested.id, 'user', `Level question ${i + 1}`, 'completed'); store.message(nested.id, 'assistant', long, 'completed'); }
  store.close();

  const run = promisify(execFile);
  const session = (await run('agent-browser', ['session', 'id', '--scope', 'worktree', '--prefix', 'video-player'])).stdout.trim();
  const b = async (...args) => (await run('agent-browser', ['--session', session, ...args], { maxBuffer: 4 * 1024 * 1024 })).stdout;
  const ev = async expression => JSON.parse(await b('eval', expression, '--json')).data.result;
  const wait = (expression, timeout = '30000') => b('wait', '--fn', expression, '--timeout', timeout);
  const click = name => b('find', 'role', 'button', 'click', '--name', name, '--exact');
  const calls = () => readFileSync(join(dir, 'calls.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line).kind);
  const checks = [];
  const pass = (name, details = true) => { checks.push({ name, pass: true, details }); console.log('PASS:', name); };
  const chatTitle = title => wait(`document.querySelector('.focused-chat h2')?.textContent===${JSON.stringify(title)} && getComputedStyle(document.querySelector('.focused-chat')).display!=='none'`);
  async function openFromMap(title) {
    if (await ev(`getComputedStyle(document.querySelector('.focused-chat')).display!=='none'`)) await b('press', 'Escape');
    await click('Fit tree');
    await b('wait', `[aria-label="Open ${title}"]`);
    await wait(`(() => { const n = document.querySelector('[aria-label=${JSON.stringify(`Open ${title}`)}]').getBoundingClientRect(), map = document.querySelector('.tree-canvas').getBoundingClientRect(); return n.left >= map.left && n.right <= map.right && n.top >= map.top && n.bottom <= map.bottom; })()`);
    await click(`Open ${title}`);
    await chatTitle(title);
  }
  const ask = async text => { await b('find', 'role', 'textbox', 'fill', '--name', 'Your question', text); await b('press', 'Enter'); };
  const card = '.focused-chat .video-inline[data-artifact]';
  const scroller = `[...document.querySelectorAll('.focused-chat *')].find(e=>e.scrollHeight>e.clientHeight+1&&/auto|scroll/.test(getComputedStyle(e).overflowY))`;
  const child_ = fork(filename, ['--serve', dir], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
  const { origin } = await new Promise((resolve, reject) => { child_.once('message', resolve); child_.once('exit', code => reject(new Error(`server exited ${code}`))); });
  try {
    await b('open', origin);
    await b('set', 'viewport', '1280', '800');
    await b('set', 'media', 'light', 'reduced-motion');
    await b('wait', '[aria-label="Open Mutual exclusion"]');
    await openFromMap('Tree levels');

    await ask('Make a video explaining how Peterson fits into this tournament tree.');
    await wait(`document.querySelector(${JSON.stringify(card)})?.dataset.state==='pending'`);
    const placement = await ev(`(()=>{const c=document.querySelector(${JSON.stringify(card)}),msgs=[...document.querySelectorAll('.focused-chat .astryx-chat-message')],own=c.closest('.astryx-chat-message');return {status:c.querySelector('[role=status]').textContent,before:c.previousElementSibling?.textContent,after:c.nextElementSibling?.textContent,inline:!!c.closest('.reply-md'),lastReply:own===msgs.at(-1),fence:document.querySelector('.focused-chat').textContent.includes('treetutor-video')}})()`);
    assert.deepEqual(placement, { status: `${task.title}: Creating video…`, before: 'Here is how Peterson fits.', after: 'Then the winners advance.', inline: true, lastReply: true, fence: false });
    pass('request inserts an inline status line between the recorded paragraphs in the nested child', placement);

    const loading = [];
    mkdirSync('.impeccable/review', { recursive: true });
    for (const [mode, width] of [['dark', 1280], ['light', 1280], ['dark', 390], ['light', 390]]) {
      await b('set', 'viewport', String(width), '800');
      await ev(`localStorage.setItem('treetutor.appearance', ${JSON.stringify(mode)}); location.reload(); true`);
      await b('wait', '[aria-label="Open Mutual exclusion"]');
      await openFromMap('Tree levels');
      await wait(`document.querySelector(${JSON.stringify(card)})?.dataset.state==='pending'`);
      await ev(`document.querySelector(${JSON.stringify(card)}).scrollIntoView({block:'center'}); true`);
      const frame = await ev(`(()=>{const c=document.querySelector(${JSON.stringify(card)}),r=c.querySelector('.video-stage').getBoundingClientRect(),s=getComputedStyle(c),t=getComputedStyle(c.querySelector('[role=status]'));return {width:r.width,height:r.height,column:c.closest('.reply-md').getBoundingClientRect().width,border:s.borderTopWidth,background:s.backgroundColor,font:t.fontFamily,buttonFont:getComputedStyle(c.querySelector('button')).fontFamily,size:t.fontSize,color:t.color,ground:getComputedStyle(document.querySelector('.focused-chat')).backgroundColor,skeleton:!!c.querySelector('.astryx-skeleton'),titleHidden:c.querySelector('h3').classList.contains('sr-only'),overflow:document.documentElement.scrollWidth>innerWidth,animations:c.getAnimations({subtree:true}).filter(a=>a.playState==='running').length}})()`);
      assert.ok(frame.height <= 48, `slim status line: ${frame.height}`);
      assert.equal(frame.width, frame.column);
      assert.equal(frame.border, '0px'); assert.equal(frame.background, 'rgba(0, 0, 0, 0)');
      assert.equal(frame.skeleton, false); assert.equal(frame.titleHidden, true);
      assert.match(frame.font, /Archivo/); assert.match(frame.buttonFont, /Archivo/); assert.ok(parseFloat(frame.size) <= 14);
      const luminance = color => color.match(/[\d.]+/g).slice(0, 3).map(v => Number(v) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
      const ink = luminance(frame.color), ground = luminance(frame.ground);
      frame.contrast = (Math.max(ink, ground) + 0.05) / (Math.min(ink, ground) + 0.05);
      assert.ok(frame.contrast >= 4.5);
      assert.equal(frame.overflow, false); assert.equal(frame.animations, 0);
      loading.push({mode,width,...frame});
      await b('screenshot', resolve(`.impeccable/review/smart-video-loading-${mode}-${width}.png`));
    }
    pass('borderless slim pending line fits wide/narrow in both appearances with reduced motion', loading);
    await b('set', 'viewport', '1280', '800');

    // Navigate elsewhere and keep chatting while the job runs.
    await openFromMap('Mutual exclusion');
    await ask('Another question meanwhile');
    await wait(`document.querySelector('.focused-chat').textContent.includes('Continuing elsewhere.')`);
    child_.send('compose');
    await wait(`document.querySelector('.overview').textContent.includes('Video: ${task.title} · creating…')`);
    assert.equal(await ev(`document.querySelectorAll(${JSON.stringify(card)}).length`), 0);
    pass('learner chats in another conversation; map row reports creating; no card appears there');

    await openFromMap('Tree levels');
    await wait(`document.querySelector(${JSON.stringify(card)})?.dataset.state==='pending'`);
    await wait(`document.querySelector(${JSON.stringify(card)}).querySelector('[role=status]').textContent===${JSON.stringify(`${task.title}: Rendering video… 40%`)}`);
    pass('inline status shows the existing rendering phase and progress fraction');
    const frameBefore = await ev(`(()=>{const r=document.querySelector(${JSON.stringify(card + ' .video-stage')}).getBoundingClientRect();return {width:r.width,height:r.height}})()`);
    assert.ok(frameBefore.height <= 48);
    assert.equal(await ev(`document.querySelector(${JSON.stringify(card + ' .video-stage')}).contains(document.querySelector(${JSON.stringify(card + ' button')}))`), true);

    // Observe announcements and progress; park the reader mid-conversation with focus in the composer.
    await ev(`(()=>{window.__statuses=[];window.__progress=[];let s,p;new MutationObserver(()=>{const c=document.querySelector(${JSON.stringify(card)});const t=c?.querySelector('[role=status]')?.textContent;if(t&&t!==s){s=t;__statuses.push(t)}const v=c?.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow');if(v&&v!==p){p=v;__progress.push(v)}}).observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true});return true})()`);
    await ev(`(()=>{const s=${scroller};s.scrollTop=Math.round((s.scrollHeight-s.clientHeight)/2);s.dispatchEvent(new Event('scroll'));return s.scrollTop})()`);
    await new Promise(r => setTimeout(r, 300));
    await ev(`document.querySelector('.focused-chat [contenteditable=true]').focus()`);
    const before = await ev(`({top:(${scroller}).scrollTop,focus:document.activeElement===document.querySelector('.focused-chat [contenteditable=true]'),messages:document.querySelectorAll('.focused-chat .astryx-chat-message').length})`);
    child_.send('render');
    await wait(`document.querySelector(${JSON.stringify(card)})?.dataset.state==='ready'`, '120000');
    await wait(`document.querySelector(${JSON.stringify(card + ' video')})?.readyState>=1`);
    await new Promise(r => setTimeout(r, 2000));
    const after = await ev(`({top:(${scroller}).scrollTop,focus:document.activeElement===document.querySelector('.focused-chat [contenteditable=true]'),messages:document.querySelectorAll('.focused-chat .astryx-chat-message').length})`);
    assert.ok(before.focus && after.focus);
    assert.ok(Math.abs(after.top - before.top) <= 1, `scroll moved ${before.top} → ${after.top}`);
    assert.equal(after.messages, before.messages);
    pass('completion keeps focus, scroll position and message count', { before, after });

    const announced = await ev(`({statuses:__statuses,progress:__progress,progressLive:false})`);
    assert.ok(announced.statuses.includes(`${task.title}: Video ready.`));
    assert.ok(announced.statuses.every(s => s === `${task.title}: Video ready.` || s.startsWith(`${task.title}: Rendering video…`)));
    const frameAfter = await ev(`(()=>{const r=document.querySelector(${JSON.stringify(card + ' video')}).getBoundingClientRect();return {width:r.width,height:r.height}})()`);
    assert.equal(frameAfter.width, frameBefore.width);
    assert.ok(Math.abs(frameAfter.width/frameAfter.height-16/9)<0.01);
    pass('player replaces the slim status line at full column width and 16:9', {frameBefore,frameAfter});
    pass('status announces rendering progress and completion without exposing production output', announced);

    const player = await ev(`(()=>{const c=document.querySelector(${JSON.stringify(card)}),v=c.querySelector('video'),list=c.closest('.astryx-chat-message');return {paused:v.paused,autoplay:v.autoplay,controls:v.controls,label:v.getAttribute('aria-label'),description:document.getElementById(v.getAttribute('aria-describedby')).textContent,ratio:Math.round(v.clientWidth/v.clientHeight*100)/100,fits:v.getBoundingClientRect().right<=list.getBoundingClientRect().right+1,duration:Math.round(v.duration),cardLive:c.getAttribute('aria-live'),status:c.querySelector('[role=status]').textContent}})()`);
    assert.deepEqual(player, { paused: true, autoplay: false, controls: true, label: `Video: ${task.title}`, description: 'Two labelled boxes slide together into a final box over two seconds.', ratio: 1.78, fits: true, duration: 2, cardLive: 'off', status: `${task.title}: Video ready.` });
    pass('ready card: paused native player within chat width, 16:9, with text explanation', player);

    // Tab reaches the player; native controls own its keys.
    await ev(`(()=>{window.__keys=[];document.addEventListener('keydown',e=>{if(e.target.tagName==='VIDEO')__keys.push({key:e.key,prevented:e.defaultPrevented})});return true})()`);
    for (let i = 0; i < 12 && !(await ev(`document.activeElement?.tagName==='VIDEO'`)); i++) await b('press', 'Shift+Tab');
    assert.equal(await ev(`document.activeElement?.tagName`), 'VIDEO');
    // Reverse Tab enters the native controls from their end; step out before the player and Tab forward onto it.
    for (let i = 0; i < 12 && (await ev(`document.activeElement?.tagName==='VIDEO'`)); i++) await b('press', 'Shift+Tab');
    await b('press', 'Tab');
    assert.equal(await ev(`document.activeElement?.tagName`), 'VIDEO');
    const video = `document.querySelector(${JSON.stringify(card + ' video')})`;
    await b('press', 'Space'); await wait(`!${video}.paused`);
    await b('press', 'Space'); await wait(`${video}.paused`);
    const t0 = await ev(`${video}.currentTime`);
    await b('press', 'ArrowRight'); await wait(`${video}.currentTime>${t0}`);
    const v0 = await ev(`${video}.volume`);
    await b('press', 'ArrowDown'); await wait(`${video}.volume<${v0}`);
    await b('press', 'ArrowUp'); await wait(`${video}.volume>=${v0}`);
    // Chrome has no fullscreen key; reverse Tab into the native controls reaches its fullscreen button third (Chrome 157 layout).
    await ev(`document.querySelector('.focused-chat [contenteditable=true]').focus()`);
    for (let i = 0; i < 12 && !(await ev(`document.activeElement?.tagName==='VIDEO'`)); i++) await b('press', 'Shift+Tab');
    await b('press', 'Shift+Tab'); await b('press', 'Shift+Tab'); await b('press', 'Enter');
    await wait(`document.fullscreenElement===${video}`);
    await ev(`document.exitFullscreen().then(()=>true)`);
    await wait(`!document.fullscreenElement`);
    await ev(`${video}.focus()`);
    await b('press', 'Escape');
    const keys = await ev(`({keys:__keys,chatOpen:getComputedStyle(document.querySelector('.focused-chat')).display!=='none',focus:document.activeElement?.tagName})`);
    // Recorded after page handlers, before the native default action: the app prevents none of the player's keys.
    assert.ok([' ', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'Escape'].every(key => keys.keys.some(k => k.key === key)) && keys.keys.every(k => !k.prevented), JSON.stringify(keys));
    assert.equal(keys.chatOpen, true);
    pass('keyboard: Tab reaches player; Space play/pause, ArrowRight seek, ArrowUp/Down volume, fullscreen button by Tab+Enter; app handlers never intercept', keys);

    // Open large: a near full-screen viewer plays the same media; Esc closes it and focus returns to the button.
    await ev(`${video}.pause()`);
    await ev(`[...document.querySelectorAll(${JSON.stringify(card + ' button')})].find(b=>b.textContent.trim()==='Open large').focus()`);
    await b('press', 'Enter');
    await wait(`(v=>!!v && !v.paused && v.currentTime>0)(document.querySelector('dialog[open] video'))`);
    const large = await ev(`(v=>({src:v.src===${video}.src,width:v.getBoundingClientRect().width>innerWidth*0.8,controls:v.controls}))(document.querySelector('dialog[open] video'))`);
    assert.deepEqual(large, { src: true, width: true, controls: true });
    mkdirSync('.impeccable/review', { recursive: true });
    await b('screenshot', resolve('.impeccable/review/video-large.png'));
    await b('press', 'Escape');
    await wait(`!document.querySelector('dialog[open]') && document.activeElement?.textContent.trim()==='Open large'`);
    assert.equal(await ev(`getComputedStyle(document.querySelector('.focused-chat')).display!=='none'`), true);
    pass('Open large plays the video in a near full-screen viewer; Esc closes and returns focus', large);

    await openFromMap('Mutual exclusion');
    assert.equal(await ev(`document.querySelectorAll(${JSON.stringify(card)}).length`), 0);
    const rows = await ev(`[...document.querySelectorAll('.overview .node-message')].map(m=>m.textContent).filter(t=>t.includes('Video:'))`);
    assert.deepEqual(rows, [`Answer: Here is how Peterson fits. Then the winners advance.Video: ${task.title} · ready`]);
    pass('finished video only in its original conversation; map row shows compact status', rows);

    const callsBefore = calls();
    await b('reload');
    await b('wait', '[aria-label="Open Mutual exclusion"]');
    await openFromMap('Tree levels');
    await wait(`document.querySelector(${JSON.stringify(card + ' video')})?.readyState>=1`);
    const reloaded = await ev(`(()=>{const v=document.querySelector(${JSON.stringify(card + ' video')});return {paused:v.paused,duration:Math.round(v.duration),media:performance.getEntriesByType('resource').filter(e=>e.name.endsWith('/media')).map(e=>e.responseStatus)}})()`);
    assert.deepEqual(calls(), callsBefore);
    assert.equal(reloaded.paused, true);
    assert.equal(reloaded.duration, 2);
    pass('reload restores the ready video from the local file with no provider request', { ...reloaded, providerCalls: callsBefore });
    const appearances = [];
    for (const [mode, width] of [['dark', 1280], ['light', 1280], ['dark', 390], ['light', 390]]) {
      await b('set', 'viewport', String(width), '800');
      await ev(`localStorage.setItem('treetutor.appearance', ${JSON.stringify(mode)}); location.reload(); true`);
      await b('wait', '[aria-label="Open Mutual exclusion"]');
      await openFromMap('Tree levels');
      await wait(`${video}?.readyState>=1`);
      // Capture a decoded frame, rather than the metadata-only player's loading spinner.
      await ev(`${video}.currentTime=1; true`);
      await wait(`${video}.readyState===4 && !${video}.seeking && ${video}.currentTime===1`);
      await b('focus', card + ' video'); await b('press', 'Space');
      await wait(`!${video}.paused && ${video}.currentTime>=1.3`);
      await b('press', 'Space'); await wait(`${video}.paused`);
      await ev(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))`);
      await ev(`document.querySelector(${JSON.stringify(card)}).scrollIntoView({block:'center'}); document.activeElement?.blur(); true`);
      await b('mouse', 'move', '5', '5');
      const style = await ev(`(() => { const c=document.querySelector(${JSON.stringify(card)}),s=getComputedStyle(c),a=[...c.querySelectorAll('button')]; return { surface:s.backgroundColor,chat:getComputedStyle(document.querySelector('.focused-chat')).backgroundColor,border:s.borderTopWidth,padding:getComputedStyle(c.firstElementChild).padding,inline:!!c.closest('.reply-md'),before:c.previousElementSibling?.textContent,after:c.nextElementSibling?.textContent,ghost:a.every(n=>n.dataset.variant==='ghost'),paused:c.querySelector('video').paused }; })()`);
      assert.equal(style.surface, 'rgba(0, 0, 0, 0)'); assert.equal(style.border, '0px'); assert.equal(style.padding, '0px'); assert.ok(style.inline && style.ghost && style.paused);
      assert.equal(style.before, 'Here is how Peterson fits.'); assert.equal(style.after, 'Then the winners advance.');
      assert.equal(await ev(`document.documentElement.scrollWidth<=innerWidth`), true);
      appearances.push({ mode, width, ...style });
      await b('screenshot', join(process.cwd(), `.impeccable/review/smart-video-ready-${mode}-${width}.png`));
    }
    assert.notEqual(appearances[0].chat, appearances[1].chat);
    assert.deepEqual(calls(), callsBefore);
    pass('dark and light: borderless inline player at its saved position, ghost actions and paused decoded frame; no new inference', appearances);

    writeFileSync('docs/verification/smart-video-player.json', JSON.stringify({ checkedAt: new Date().toISOString(), evidence: 'Synthetic tutor and worker providers; real sandboxed Remotion render, production build, HTTP, SQLite and headless Chrome. No native provider inference.', checks }, null, 2) + '\n');
  } finally { await b('close').catch(() => {}); child_.send('stop'); }
}
