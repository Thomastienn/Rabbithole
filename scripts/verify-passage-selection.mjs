import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

const run = promisify(execFile), session = `passage-${process.pid}`;
const b = async (...args) => (await run('agent-browser', ['--session', session, ...args])).stdout;
const ev = async expression => JSON.parse(await b('eval', expression, '--json')).data.result;
const wait = expression => b('wait', '--fn', expression);
const click = name => b('find', 'role', 'button', 'click', '--name', name, '--exact');
const store = new Store(join(mkdtempSync(join(tmpdir(), 'passage-')), 'data.sqlite'));
const root = store.create('Selection fixture');
const text = 'repeat 😀 repeat 😀 end';
const messageId = store.message(root.id, 'assistant', text, 'completed');
store.message(root.id, 'assistant', 'Another reply.', 'completed');
let rich = '# Lesson\n\nA *same* and *same* 😀 with `inline`.\n\n- first item\n- second **item**\n\n| left | right |\n| --- | --- |\n| cell 😀 | tail |\n\nInline $x^2$ math.\n\n$$\ny = mx\n$$\n\n```js\njs\nconst answer = 42;\nlet next = answer;\n```\n\n[site](https://example.com) [blocked](javascript:alert(1)) <b>raw</b>';
let richId;
let stream;
const app = createApp({ store, auth: { status: () => ({ connected: true }) }, provider: { models: async () => [{ model: 'fixture', label: 'Fixture model', isDefault: true }], generate: async (_tree, text, emit) => {
  if (text === 'Stream Markdown') return new Promise(resolve => { stream = { emit, resolve }; emit({ type: 'item', item: 'one', text: '# Stable\n\nEarlier paragraph.\n\n```js\nconst first = 1;\n' }); });
  emit({ type: 'item', item: 'one', text: 'Fixture response' }); emit({ type: 'status', status: 'completed' });
} } });
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${app.server.address().port}`;
rich = rich.replace('https://example.com', `${origin}/?reply-link`);
try {
  await b('open', origin);
  await b('set', 'media', 'light', 'reduced-motion');
  await b('wait', '[aria-label="Open Selection fixture"]');
  await click('Open Selection fixture');
  await b('wait', '.focused-chat [aria-label="Your question"]');
  assert.equal(await ev(`[...document.querySelectorAll('button')].filter(b=>b.textContent.trim()==='Ask about selection').length`), 0);
  const points = await ev(`(async()=>{await document.fonts.ready;const walker=document.createTreeWalker(document.querySelector('.focused-chat'),NodeFilter.SHOW_TEXT);let n;while((n=walker.nextNode())) if(n.textContent===${JSON.stringify(text)}) break;n.parentElement.scrollIntoView({block:'center',behavior:'instant'});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const a=document.createRange(),z=document.createRange();a.setStart(n,10);a.setEnd(n,11);z.setStart(n,17);z.setEnd(n,19);const first=a.getBoundingClientRect(),last=z.getBoundingClientRect();return [first.left+1,first.top+first.height/2,last.right-1,last.top+last.height/2]})()`);
  await b('mouse', 'move', String(Math.round(points[0])), String(Math.round(points[1])));
  await b('mouse', 'down', 'left');
  await b('mouse', 'move', String(Math.round(points[2])), String(Math.round(points[3])), '--steps', '12');
  const drag = async () => {
    await b('mouse', 'move', String(Math.round(points[0])), String(Math.round(points[1])));
    await b('mouse', 'down', 'left');
    await b('mouse', 'move', String(Math.round(points[2])), String(Math.round(points[3])), '--steps', '12');
    await b('mouse', 'up', 'left');
    // A pointer highlight opens the passage textbox above it directly, focused and empty.
    await wait(`document.activeElement?.closest('.passage-box .branch-form') && document.activeElement.value === ''`);
  };
  await b('mouse', 'up', 'left');
  await wait(`document.activeElement?.closest('.passage-box .branch-form') && document.activeElement.value === ''`);
  assert.equal(await ev(`[...document.querySelectorAll('button')].filter(b=>b.textContent.trim()==='Ask about selection').length`), 0);
  // An empty box cannot be sent: Enter does nothing.
  await b('press', 'Enter');
  assert.equal(store.list().length, 1);
  await b('find', 'role', 'textbox', 'fill', '--name', 'Question about this passage', 'First draft');
  await b('find', 'role', 'textbox', 'fill', '--name', 'Question about this passage', 'Edited question');
  // Escape dismisses the popup (no Cancel branch button) and returns focus to the reply.
  await b('press', 'Escape');
  await wait(`!document.querySelector('.branch-form') && document.activeElement?.matches('.focused-chat .passage > section')`);
  assert.equal(store.list().length, 1);
  await drag();
  await b('find', 'role', 'textbox', 'fill', '--name', 'Question about this passage', 'Mouse question');
  await ev(`document.querySelector('[aria-label="Create focused chat"]').focus()`);
  await b('press', 'Enter');
  await wait(`document.querySelector('.focused-chat h2')?.textContent === 'Mouse question'`);
  await wait(`document.activeElement?.closest('.focused-chat [role=textbox]') !== null`);
  const mouseChild = store.list().find(t => t.parent === root.id);
  const mouseBranch = store.tree(mouseChild.id).branch;
  assert.deepEqual([mouseBranch.messageId, mouseBranch.start, mouseBranch.end, mouseBranch.text], [messageId, 10, 19, 'repeat 😀']);
  await click('Return to parent conversation');
  await wait(`document.querySelector('.focused-chat h2')?.textContent === 'Selection fixture' && [...document.querySelectorAll('button')].some(e => e.textContent.trim() === 'Select passage in tutor reply 1')`);

  await b('eval', '[...document.querySelectorAll("button")].find(e => e.textContent.trim() === "Select passage in tutor reply 1").focus(); true'); await b('press', 'Enter');
  await wait(`document.activeElement?.tagName === 'TEXTAREA' && document.activeElement.value === 'repeat 😀 repeat 😀 end'`);
  await b('press', 'Home');
  await b('press', 'Shift+ArrowRight');
  await b('press', 'Escape');
  assert.equal(store.list().length, 2);
  await b('eval', '[...document.querySelectorAll("button")].find(e => e.textContent.trim() === "Select passage in tutor reply 1").focus(); true'); await b('press', 'Enter');
  await wait(`document.activeElement?.tagName === 'TEXTAREA' && document.activeElement.value === 'repeat 😀 repeat 😀 end'`);
  await b('press', 'Home');
  for (let i = 0; i < 17; i++) await b('press', 'Shift+ArrowRight');
  await wait(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Ask about selection')`);
  await b('press', 'Tab');
  assert.equal(await ev(`document.activeElement?.textContent.trim()`), 'Ask about selection');
  await b('press', 'Enter');
  await b('find', 'role', 'textbox', 'fill', '--name', 'Question about this passage', 'Edited question');
  await ev(`document.querySelector('[aria-label="Create focused chat"]').focus()`);
  await b('press', 'Enter');
  await wait(`document.querySelector('.focused-chat h2')?.textContent === 'Edited question'`);
  const child = store.list().find(t => t.parent === root.id && t.id !== mouseChild.id);
  assert.ok(child);
  const branch = store.tree(child.id).branch;
  assert.deepEqual([branch.messageId, branch.start, branch.end, branch.text, branch.question], [messageId, 0, 19, 'repeat 😀 repeat 😀', 'Edited question']);
  richId = store.message(root.id, 'assistant', rich, 'completed');
  store.message(root.id, 'user', '**literal learner question**', 'completed');
  await click('Return to parent conversation');
  await b('wait', '.reply-md table');
  assert.equal(await ev(`document.querySelectorAll('.focused-chat b, .focused-chat a[href^="javascript:"]').length`), 0);
  assert.equal(await ev(`[...document.querySelectorAll('.focused-chat .astryx-chat-message')].some(e => e.textContent.includes('**literal learner question**') && !e.querySelector('strong'))`), true);

  // Native mouse and DOM Range cases both drive Passage's real mouseup handler and HTTP endpoint.
  const selectRich = async (from, to, mouse = false) => {
    const points = await ev(`(async () => {
      await document.fonts.ready;
      const root = document.querySelectorAll('.focused-chat .reply-md')[2];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), nodes = []; let n;
      while ((n = walker.nextNode())) nodes.push(n);
      const find = ([text, occurrence, offset]) => { const n = nodes.filter(n => n.textContent.includes(text))[occurrence]; return [n, n.textContent.indexOf(text) + offset]; };
      const [a, i] = find(${JSON.stringify(from)}), [z, j] = find(${JSON.stringify(to)}), range = document.createRange();
      range.setStart(a, i); range.setEnd(z, j);
      a.parentElement.scrollIntoView({ block: 'center', behavior: 'instant' });
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      if (${mouse}) { const first = document.createRange(), last = document.createRange(); first.setStart(a, i); first.setEnd(a, i + 1); last.setStart(z, j - 1); last.setEnd(z, j); const p = first.getBoundingClientRect(), q = last.getBoundingClientRect(); return [p.left + 1, p.top + p.height / 2, q.right - 1, q.top + q.height / 2]; }
      window.getSelection().removeAllRanges(); window.getSelection().addRange(range); root.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      return null;
    })()`);
    if (mouse) {
      await b('mouse', 'move', String(Math.round(points[0])), String(Math.round(points[1])));
      await b('mouse', 'down', 'left');
      await b('mouse', 'move', String(Math.round(points[2])), String(Math.round(points[3])), '--steps', '12');
      await b('mouse', 'up', 'left');
    }
    await wait(`!!document.activeElement?.closest('.passage-box .branch-form')`);
  };
  const cases = [
    [['same', 1, 0], ['same', 1, 4], 'same', true],
    [['same', 0, 1], ['same', 1, 3], 'ame* and *sam'],
    [['first item', 0, 0], ['item', 1, 4], 'first item\n- second **item', true],
    [['cell 😀', 0, 0], ['tail', 0, 4], 'cell 😀 | tail'],
    [['x', 0, 0], ['2', 0, 1], '$x^2$'],
    [['y', 0, 0], ['mx', 0, 2], '$$\ny = mx\n$$'],
    [['const', 0, 2], ['let', 0, 3], 'nst answer = 42;\nlet', true],
  ];
  const saved = [];
  for (const [from, to, selected, mouse] of cases) {
    await selectRich(from, to, mouse);
    assert.equal(await ev(`document.getElementById(document.querySelector('.branch-form input').getAttribute('aria-describedby')).textContent`), selected);
    const title = `Rich branch ${saved.length}`;
    await b('find', 'role', 'textbox', 'fill', '--name', 'Question about this passage', title);
    await click('Create focused chat');
    await wait(`document.querySelector('.focused-chat h2')?.textContent === ${JSON.stringify(title)}`);
    const child = store.list().find(t => t.title === title), anchor = store.tree(child.id).branch;
    assert.equal(anchor.messageId, richId);
    assert.equal(anchor.text, selected);
    assert.equal(rich.slice(anchor.start, anchor.end), selected);
    assert.equal(anchor.start, title === 'Rich branch 0' ? rich.indexOf('same', rich.indexOf('same') + 1) : rich.indexOf(selected));
    saved.push({ title, anchor });
    await click('Return to tree');
    await b('wait', `[aria-label="Reveal source passage for ${title}"]`);
    await ev(`document.querySelector('[aria-label="Reveal source passage for ${title}"]').focus()`);
    await b('press', 'Enter');
    await wait(`document.querySelector('.focused-chat [aria-label="Source passage"]') !== null`);
    assert.equal(await ev(`document.activeElement?.getAttribute('aria-label')`), 'Source passage');
  }

  // A pre-renderer anchor includes hidden opening syntax and ends partway through code.
  const start = rich.indexOf('**item'), end = rich.indexOf('answer = 42') + 6;
  store.branch(store.tree(root.id), { messageId: richId, start, end, text: rich.slice(start, end), question: 'Old raw anchor' }, 'Pre-renderer snapshot');
  store.branch(store.tree(root.id), { messageId: richId, start: rich.indexOf('```js'), end: rich.indexOf('```js') + 5, text: '```js', question: 'Old fence anchor' }, 'Pre-renderer syntax');
  await b('reload');
  for (const title of ['Old raw anchor', 'Old fence anchor', 'Rich branch 6']) {
    await b('wait', `[aria-label="Reveal source passage for ${title}"]`);
    await ev(`document.querySelector('[aria-label="Reveal source passage for ${title}"]').focus()`);
    await b('press', 'Enter');
    await wait(`document.activeElement?.getAttribute('aria-label') === 'Source passage'`);
    const marks = await ev(`[...document.querySelectorAll('.focused-chat mark')].map(m => ({ start: +m.dataset.o, end: +m.dataset.e, text: m.textContent }))`);
    assert.ok(marks.length, title);
    for (const m of marks) assert.equal(m.text, rich.slice(m.start, m.end));
    if (title === 'Old fence anchor') assert.equal(marks.map(m => m.text).join(''), '```js');
    if (title === 'Rich branch 6') assert.equal(marks.map(m => m.text).join(''), 'nst answer = 42;\nlet');
    await click('Return to tree');
  }

  await click('Open Selection fixture');
  await b('wait', '.focused-chat [aria-label="Your question"]');
  await b('find', 'role', 'textbox', 'fill', '--name', 'Your question', 'Stream Markdown');
  await click('Send');
  await b('wait', '--text', 'const first');
  await ev(`window.__stable = { heading: [...document.querySelectorAll('.reply-md h3')].at(-1), code: [...document.querySelectorAll('.reply-md pre')].at(-1) }; window.__stable.layoutTop = () => { let top = window.__stable.heading.getBoundingClientRect().top; for (let n = window.__stable.heading.parentElement; n; n = n.parentElement) top += n.scrollTop; return top; }; window.__stable.top = window.__stable.layoutTop(); true`);
  stream.emit({ type: 'delta', item: 'one', text: 'let second = 2;\n' });
  await b('wait', '--text', 'let second');
  assert.equal(await ev(`window.__stable.heading.isConnected && window.__stable.code.isConnected`), true);
  assert.ok(await ev(`Math.abs(window.__stable.layoutTop() - window.__stable.top) < 1`), 'append changes height below earlier content; scroll-following is not a layout shift');
  stream.emit({ type: 'delta', item: 'one', text: '\n```\n\n**Done.**' });
  stream.emit({ type: 'status', status: 'completed' }); stream.resolve();
  await b('wait', '--text', 'Done.');
  await wait(`!document.querySelector('[aria-label="Stop"]')`);
  assert.equal(await ev(`window.__stable.heading.isConnected && window.__stable.code.isConnected`), true, 'completion keeps the same rendered reply');
  await click('Return to tree');
  assert.equal(await ev(`document.querySelector('[data-message="${richId}"]').textContent.includes('# Lesson')`), false);
  assert.equal(store.tree(root.id).messages.find(m => m.id === richId).text, rich);
  await click('Open Selection fixture');
  await b('wait', '.focused-chat [aria-label="Your question"]');

  // Real link activation opens an isolated new tab while the conversation stays put.
  const tabsBefore = JSON.parse(await b('tab', 'list', '--json')).data.tabs;
  const original = tabsBefore.find(t => t.active), originalUrl = await b('get', 'url');
  await b('find', 'role', 'link', 'click', '--name', 'site', '--exact');
  const linkTab = JSON.parse(await b('tab', 'list', '--json')).data.tabs.find(t => !tabsBefore.some(old => old.tabId === t.tabId));
  assert.ok(linkTab, 'link opens a new tab');
  await b('tab', linkTab.tabId);
  await b('wait', '--url', `${origin}/?reply-link`);
  assert.equal(await ev('window.opener === null'), true);
  await b('tab', original.tabId);
  assert.equal(await b('get', 'url'), originalUrl);
  await b('tab', 'close', linkTab.tabId);

  const screenshots = mkdtempSync(join(tmpdir(), 'passage-markdown-'));
  for (const [width, height] of [[1280, 1000], [390, 1000]]) {
    await b('set', 'viewport', String(width), String(height));
    for (const scheme of ['light', 'dark']) {
      await b('set', 'media', scheme, 'reduced-motion');
      await ev(`document.querySelectorAll('.focused-chat .reply-md')[2].scrollIntoView({ block: 'start' }); true`);
      const styles = await ev(`(() => { const r = document.querySelectorAll('.focused-chat .reply-md')[2], code = r.querySelector('pre'), keyword = code.querySelector('.astryx-token-keyword'); return { overflow: document.documentElement.scrollWidth > innerWidth, keyword: getComputedStyle(keyword).color, code: getComputedStyle(code).color, heading: getComputedStyle(r.querySelector('h3')).fontSize, body: getComputedStyle(r.querySelector('p')).fontSize, math: r.querySelector('math').getBoundingClientRect().width }; })()`);
      assert.equal(styles.overflow, false);
      assert.notEqual(styles.keyword, styles.code, `${scheme} syntax highlighting`);
      assert.ok(parseFloat(styles.heading) > parseFloat(styles.body) && styles.math > 0);
      await b('screenshot', join(screenshots, `${width}-${scheme}.png`));
    }
  }
  console.log(`PASS: built-app browser fixture: native plain/rich mouse selection; DOM Range math/table cases; real branch HTTP validation; keyboard/cancel/focus; old/new reload reveal; streaming DOM stability; plain previews; light/dark desktop/mobile. Screenshots: ${screenshots}`);
} finally { await b('close').catch(() => {}); app.stop(); store.close(); }
