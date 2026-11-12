// Learning tree rail: production UI/HTTP/SQLite, synthetic saved study and providers only.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

const run = promisify(execFile), session = `sidebar-identity-${process.pid}`;
const b = async (...args) => (await run('agent-browser', ['--session', session, ...args], { maxBuffer: 8 << 20 })).stdout;
const ev = async code => JSON.parse(await b('eval', code, '--json')).data.result;
const wait = code => b('wait', '--fn', `!!(${code})`);
const click = name => b('find', 'role', 'button', 'click', '--name', name, '--exact');
const item = name => b('find', 'role', 'menuitem', 'click', '--name', name, '--exact');
const idle = `!document.getAnimations().some(a => a.playState === 'running' && a.effect?.getTiming().iterations !== Infinity)`;
const dir = mkdtempSync(join(tmpdir(), 'tt-sidebar-identity-')), store = new Store(join(dir, 'trees.sqlite'));
const saved = (title, days) => {
  const t = store.create(title, 'claude'), date = new Date(); date.setDate(date.getDate() - days);
  store.db.prepare('UPDATE trees SET created=? WHERE id=?').run(date.getTime(), t.id);
  store.message(t.id, 'user', `Explain ${title.toLowerCase()}.`, 'completed');
  store.message(t.id, 'assistant', 'A saved discussion for this synthetic learning tree.', 'completed');
  return t;
};
saved('Linear transformations', 14);
saved('Binary search invariants', 4);
const yesterday = saved('How do fungi trade?', 1);
const root = saved('Tournament trees', 0);
const source = store.message(root.id, 'assistant', 'Peterson locks pair threads at each level of a tournament tree.', 'completed');
const child = store.branch(root, { messageId: source, start: 0, end: 8, text: 'Peterson', question: "Peterson's algorithm" }, 'Synthetic context only.');
store.message(child.id, 'assistant', 'Two threads each raise a flag before taking turns.', 'completed');
const provider = { models: async () => [{ model: 'fixture', label: 'Fixture model', isDefault: true }], generate: async (_t, _p, emit) => emit({ type: 'status', status: 'completed' }) };
const app = createApp({ store, dir, providers: { claude: provider, codex: provider }, auth: { status: () => ({ connected: true }) } });
await new Promise(r => app.server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${app.server.address().port}`, out = resolve('docs/verification');
const results = { issue: 'TreeTutor-nwx.7', checkedAt: new Date().toISOString(), evidence: 'Production build, agent-browser Chromium, isolated SQLite and HTTP; synthetic providers and study. No native provider inference.', appearances: {}, checks: [], screenshots: [] };
const shot = async name => { await wait(idle); await wait(`document.fonts.status === 'loaded'`); const file = `sidebar-${name}.png`; await b('screenshot', join(out, file)); results.screenshots.push(file); };
const current = id => `document.querySelector('.saved-chat-title[aria-current=page]')?.getAttribute('aria-describedby') === 'branch-count-${id}'`;
const openDrawer = async () => { await click('Expand learning trees'); await wait(`document.querySelector('dialog[open] .tree-drawer') && ${idle}`); };
const drawerClosed = () => wait(`!document.querySelector('dialog[open] .tree-drawer')`);
try {
  await b('set', 'viewport', '1440', '900'); await b('set', 'media', 'light', 'reduced-motion');
  await b('open', origin);
  for (const mode of ['dark', 'light']) {
    await ev(`localStorage.setItem('treetutor.appearance', '${mode}'); true`); await b('reload');
    await wait(`document.querySelector('[aria-label="Open Tournament trees"]') && ${idle}`);
    assert.deepEqual(await ev(`[...document.querySelectorAll('.tree-date-heading')].map(e => e.textContent)`), ['Today', 'Yesterday', 'Previous 7 days', 'Older']);
    assert.equal(await ev(`document.querySelectorAll('.saved-chat-title').length`), 4);
    assert.equal(await ev(`document.getElementById('branch-count-${root.id}').textContent`), '1 branch');
    assert.equal(await ev(current(root.id)), true);
    const styles = await ev(`(() => {
      const rail = document.querySelector('.trees'), action = rail.querySelector('.new-chat'), row = rail.querySelector('[data-current=true]');
      const token = (name, prop = 'color') => { const el = document.createElement('i'); el.style[prop] = 'var(' + name + ')'; rail.append(el); const value = getComputedStyle(el)[prop]; el.remove(); return value; };
      return { width: rail.getBoundingClientRect().width, background: getComputedStyle(rail).backgroundColor, muted: token('--color-background-muted', 'backgroundColor'), fill: getComputedStyle(row).backgroundColor, neutral: token('--color-neutral', 'backgroundColor'), action: getComputedStyle(action).color, accent: token('--color-text-accent'), actionBackground: getComputedStyle(action).backgroundColor, wordmark: rail.querySelector('.tree-navigation-content').firstElementChild.textContent.includes('TreeTutor'), font: getComputedStyle(rail).fontFamily, radius: getComputedStyle(row).borderRadius, overflow: document.documentElement.scrollWidth > innerWidth, footer: [...rail.querySelectorAll('.tree-navigation-footer button')].map(e => e.textContent.trim()) };
    })()`);
    assert.equal(styles.width, 232); assert.equal(styles.background, styles.muted); assert.equal(styles.fill, styles.neutral);
    assert.equal(styles.action, styles.accent); assert.equal(styles.actionBackground, 'rgba(0, 0, 0, 0)');
    assert.equal(styles.wordmark, true); assert.match(styles.font, /Archivo/); assert.equal(styles.radius, '3px'); assert.equal(styles.overflow, false);
    assert.deepEqual(styles.footer, ['Knowledge', 'Videos', 'Settings']);
    results.appearances[mode] = styles;
    await shot(mode);
    // A non-current tree's overflow is keyboard reachable and never changes selection.
    await b('focus', `#chat-actions-${yesterday.id}`); await b('press', 'Enter');
    await wait(`[...document.querySelectorAll('[role=menuitem]')].some(e => e.checkVisibility())`);
    assert.equal(await ev(current(root.id)), true);
    await shot(`menu-${mode}`);
    await b('press', 'Escape'); await wait(`document.activeElement?.id === 'chat-actions-${yesterday.id}'`);
    if (process.env.IMPECCABLE_SCAN) {
      const html = await ev(`document.documentElement.outerHTML.replace(/<script\\b[^>]*>[\\s\\S]*?<\\/script>/gi, '').replace('<head>', '<head><base href="${origin}/">')`);
      const target = join(dir, `${mode}.html`); writeFileSync(target, html);
      let scan; try { scan = await run(process.env.IMPECCABLE_SCAN, ['detect', `file://${target}`, '--json']); }
      catch (error) { if (error.code !== 2) throw error; scan = error; }
      results.appearances[mode].detector = JSON.parse(scan.stdout);
    }
  }
  results.checks.push('Dark/light: deeper 232px rail, Archivo wordmark, yellow text New chat, 4px current fill, all four date groups, descendant count, labelled footer, keyboard overflow and focus return.');
  await click("Open Peterson's algorithm"); await wait(`document.querySelector('.focused-chat h2')?.textContent === "Peterson's algorithm" && ${idle}`);
  assert.equal(await ev(current(root.id)), true, 'a branch keeps its root current');
  await click('Settings'); await wait(`document.querySelector('dialog[open] #settings-heading')`);
  await b('press', 'Escape'); await wait(`document.activeElement?.textContent.trim() === 'Settings'`);
  const view = await ev(`document.querySelector('.react-flow__viewport').style.transform`);
  await click('Knowledge'); await wait(`document.activeElement?.id === 'return-to-learning'`);
  assert.equal(await ev(`document.querySelector('.tree-navigation-footer [aria-current=page]')?.textContent.trim()`), 'Knowledge');
  await b('press', 'Enter'); await wait(`document.querySelector('.focused-chat h2')?.textContent === "Peterson's algorithm"`);
  assert.equal(await ev(`document.querySelector('.react-flow__viewport').style.transform`), view);
  await click('Collapse learning trees'); await wait(`document.activeElement?.id === 'expand-learning-trees'`);
  await b('reload'); await wait(`document.querySelector('#expand-learning-trees')`);
  assert.equal(await ev(`getComputedStyle(document.querySelector('.trees')).display`), 'none');
  await b('focus', '#expand-learning-trees'); await b('press', 'Enter');
  await wait(`document.activeElement?.id === 'collapse-learning-trees'`);
  await b('reload'); await wait(`document.querySelector('.trees[data-open=true]')`);
  results.checks.push('Child selection marks its root; Settings Escape returns to its labelled opener; Knowledge returns to the same conversation/map transform; keyboard collapse/expand and both stored preferences survive reload.');

  // Long history scrolls independently of the wordmark/New chat and footer.
  for (let i = 0; i < 20; i++) saved(`Earlier study ${i + 1}`, 20 + i);
  await b('reload'); await wait(`document.querySelectorAll('.saved-chat-title').length === 24`);
  const foot = await ev(`document.querySelector('.tree-navigation-footer').getBoundingClientRect().top`);
  await ev(`document.querySelector('.tree-list').scrollTop = 100000; true`);
  assert.equal(await ev(`document.querySelector('.tree-navigation-footer').getBoundingClientRect().top`), foot);
  assert.equal(await ev(`document.querySelector('.tree-list').scrollTop > 0`), true);
  await click('Actions for Earlier study 20'); await item('Rename chat');
  await b('find', 'label', 'Conversation title', 'fill', 'x'.repeat(200)); await b('press', 'Enter');
  await wait(`document.querySelector('[aria-label="Actions for ${'x'.repeat(200)}"]')`);
  assert.equal(await ev(`document.documentElement.scrollWidth === innerWidth`), true);
  await shot('long-history-light');
  results.checks.push('Long history scrolls without moving footer; 200-character unbroken inline rename persists without page overflow.');

  for (const mode of ['dark', 'light']) {
    await ev(`localStorage.setItem('treetutor.appearance', '${mode}'); true`);
    await b('set', 'viewport', '390', '844'); await b('reload');
    await wait(`document.querySelector('#expand-learning-trees')`); await openDrawer();
    assert.equal(await ev(`localStorage.getItem('treetutor.sidebar')`), 'open');
    assert.equal(await ev(`document.querySelector('.tree-drawer').textContent.includes('Settings')`), true);
    assert.equal(await ev(`(() => { const d=document.querySelector('dialog[open]'), r=d.getBoundingClientRect(); return r.left >= 0 && r.right < innerWidth && d.scrollWidth <= d.clientWidth && document.documentElement.scrollWidth === innerWidth; })()`), true);
    await shot(`drawer-${mode}`);
    for (let i = 0; i < 5; i++) { await b('press', 'Shift+Tab'); assert.equal(await ev(`document.querySelector('dialog[open]').contains(document.activeElement)`), true); }
    console.log(`PASS: ${mode} drawer bounds and focus trap`);
    await b('focus', 'dialog[open] .new-chat');
    await wait(`[...document.querySelectorAll('[role=tooltip]')].every(e => !e.checkVisibility())`);
    await b('press', 'Escape');
    await drawerClosed(); await wait(`document.activeElement?.id === 'expand-learning-trees'`);
    console.log(`PASS: ${mode} drawer Escape`);
    if (mode === 'dark') {
      await openDrawer(); await click('Actions for How do fungi trade?'); await item('Rename chat');
      await b('find', 'label', 'Conversation title', 'fill', 'Cancel this mobile rename'); await b('press', 'Escape');
      await wait(`document.activeElement?.id === 'chat-actions-${yesterday.id}'`);
      assert.equal(store.tree(yesterday.id).title, 'How do fungi trade?');
      await b('press', 'Enter'); await item('Delete chat…');
      await wait(`document.querySelector('[role=alertdialog][open]') && document.activeElement?.textContent === 'Keep conversations'`);
      await shot('drawer-delete-dark');
      await b('press', 'Escape');
      await wait(`!document.querySelector('[role=alertdialog][open]') && document.activeElement?.id === 'chat-actions-${yesterday.id}'`);
      assert.equal(!!store.tree(yesterday.id), true);
      await click('Settings'); await wait(`document.querySelector('dialog[open] #settings-heading')`);
      await b('press', 'Escape'); await wait(`!document.querySelector('dialog[open] #settings-heading') && document.activeElement?.textContent.trim() === 'Settings'`);
      assert.equal(await ev(`!!document.querySelector('dialog[open] .tree-drawer')`), true);
      await click('Collapse learning trees'); await drawerClosed();
      results.checks.push('Drawer overflow: keyboard rename Escape and delete cancellation retain data/drawer and restore ellipsis focus; nested Settings closes back to its labelled drawer action.');
    }
    await openDrawer(); await click('How do fungi trade?'); await drawerClosed();
    console.log(`PASS: ${mode} drawer tree selection`);
    await wait(`document.querySelector('[aria-label="Open How do fungi trade?"]')`);
    await openDrawer(); await click('Knowledge'); await drawerClosed(); await wait(`document.activeElement?.id === 'return-to-learning'`);
    await b('press', 'Enter');
    await openDrawer(); await click('New chat'); await drawerClosed();
    await wait(`document.activeElement?.getAttribute('aria-label') === 'Your question'`);
    assert.equal(await ev(`document.querySelector('.focused-chat [role=textbox]').getBoundingClientRect().bottom <= innerHeight`), true);
    // A second New chat reopens the same unstarted root.
    assert.equal(store.list().filter(t => !t.parent && t.title === 'New chat').length, 1);
  }
  results.checks.push('390px both appearances: same rail in bounded drawer, Tab trapped, Escape returns to opener, tree/Knowledge/New chat dismiss it, Knowledge and composer get focus, no overflow; desktop preference preserved.');
  await b('set', 'viewport', '1440', '900'); await wait(`document.querySelector('.trees[data-open=true]')`);
  await click('Return to tree'); await click('Map menu'); await item('Learning trees');
  assert.equal(await ev(`getComputedStyle(document.querySelector('.trees')).display`), 'none');
  await click('Map menu'); await item('Learning trees');
  assert.equal(await ev(`getComputedStyle(document.querySelector('.trees')).display`), 'flex');
  // Remove fixture study through storage only to exercise the empty rail, without real learner data.
  for (const t of store.list().filter(t => !t.parent)) store.remove(t.id, t.id, () => {});
  await b('reload'); await wait(`document.querySelector('.empty-map')`);
  assert.equal(await ev(`document.querySelector('.tree-list').textContent.trim()`), 'Your first tree starts with a question.');
  await shot('empty-light');
  results.checks.push('Resizing restores desktop preference; map menu toggles rail both ways; empty saved study retains first-question guidance and New chat.');
  writeFileSync(join(out, 'sidebar-identity-results.json'), JSON.stringify(results, null, 2) + '\n');
  console.log(`PASS: ${results.checks.join('\nPASS: ')}`);
} catch (error) { console.error(await b('snapshot', '-i').catch(() => 'snapshot unavailable')); throw error; }
finally { await b('close').catch(() => {}); app.stop(); store.close(); }
