// Built-app browser fixture (in-process fake provider, not a live model) for the Library page:
// volumes with one spine tick per conversation, title search, the Shelf/List switch and its saved choice,
// opening a volume in Read, Rename/Delete menus, the first-run prompt, AA contrast, keyboard reach and the
// paper focus ring in dark and light. Saves screenshots under the verify output folder (lib/output.mjs).
import { verifyOut } from './lib/output.mjs';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';

const run = promisify(execFile),
  session = `library-${process.pid}`;
const b = async (...args) =>
  (
    await run('agent-browser', ['--session', session, ...args], {
      env: { ...process.env, AGENT_BROWSER_INIT_SCRIPTS: resolve('scripts/layout-clock.js') },
    })
  ).stdout;
const ev = async (expression) => JSON.parse(await b('eval', expression, '--json')).data.result;
const wait = (expression) => b('wait', '--fn', `!!(${expression})`);
const click = (name) => b('find', 'role', 'button', 'click', '--name', name, '--exact');
const provider = {
  models: async () => [{ model: 'fixture', label: 'Fixture model', isDefault: true }],
  generate: async () => {},
};
const serve = async (store) => {
  const app = createApp({ store, auth: { status: () => ({ connected: true }) }, provider });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  return app;
};

const day = 86_400_000,
  store = new Store(join(mkdtempSync(join(tmpdir(), 'library-')), 'data.sqlite'));
const age = (id, days) =>
  store.db.prepare('UPDATE trees SET created=? WHERE id=?').run(Date.now() - days * day, id);
const branch = (parent, question) => {
  const m = store.message(parent.id, 'assistant', 'A reply worth branching from.', 'completed');
  return store.branch(
    store.tree(parent.id),
    { messageId: m, start: 0, end: 5, text: 'A rep', question },
    'Snapshot.',
  );
};
const dream = store.create('Why do we dream?');
age(dream.id, 40);
const bayes = store.create("Bayes' rule, slowly");
age(bayes.id, 3);
branch(bayes, 'Priors?');
const roads = store.create('Roman roads');
age(roads.id, 1);
store.message(roads.id, 'user', 'Who built the roads?', 'completed');
const fungi = store.create('How do fungi trade?');
const hyphae = branch(fungi, 'What are hyphae?');
branch(hyphae, 'How long do they grow?');
branch(fungi, 'Which plants?');
branch(fungi, 'Is it fair?');
const expected = [
  ['How do fungi trade?', 5],
  ['Roman roads', 1],
  ["Bayes' rule, slowly", 2],
  ['Why do we dream?', 1],
];
const app = await serve(store),
  empty = await serve(
    new Store(join(mkdtempSync(join(tmpdir(), 'library-empty-')), 'data.sqlite')),
  );
const url = (a) => `http://127.0.0.1:${a.server.address().port}`;
const steps = [];
const settle = async () => {
  await wait('document.getAnimations().every(a => a.playState !== "running")');
  await new Promise((r) => setTimeout(r, 300));
};
const shot = async (name) => {
  await settle();
  await b('screenshot', `${process.cwd()}/${verifyOut}/library-${name}.png`);
};
const contrast = (fg, bg) =>
  ev(`(() => {
  const c = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const rgb = v => { c.clearRect(0, 0, 1, 1); c.fillStyle = v; c.fillRect(0, 0, 1, 1); return [...c.getImageData(0, 0, 1, 1).data].slice(0, 3); };
  const L = v => { const [r, g, b] = rgb(v).map(x => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const [a, d] = [L(${JSON.stringify(fg)}), L(${JSON.stringify(bg)})].sort((x, y) => y - x); return (a + 0.05) / (d + 0.05);
})()`);
// Text colour against its background, compositing translucent layers down to the first opaque one.
const pair = (sel) =>
  ev(`(() => {
  const e = document.querySelector(${JSON.stringify(sel)}), layers = [], c = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  for (let p = e; p; p = p.parentElement) { const bg = getComputedStyle(p).backgroundColor; if (bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)') continue; layers.push(bg); if (!bg.startsWith('rgba') && !bg.includes('/')) break; }
  for (const bg of layers.reverse()) { c.fillStyle = bg; c.fillRect(0, 0, 1, 1); }
  const [r, g, b] = c.getImageData(0, 0, 1, 1).data; return [getComputedStyle(e).color, 'rgb(' + r + ', ' + g + ', ' + b + ')'];
})()`);
const token = (name) =>
  ev(
    `(() => { const e = document.createElement('i'); e.style.color = 'var(${name})'; document.querySelector('.library-content').append(e); const c = getComputedStyle(e).color; e.remove(); return c; })()`,
  );
const titles = () =>
  ev(`[...document.querySelectorAll('.saved-chat-title')].map(e => e.innerText.trim())`);
const openLibrary = async () => {
  await b('click', '.tree-switcher');
  await wait(`document.querySelector('.saved-chat-title')`);
};

async function checkAppearance(appearance) {
  for (const layout of ['shelf', 'list']) {
    await b('eval', `localStorage.setItem('treetutor.library-layout', '${layout}'); true`);
    await b('eval', 'location.reload(); true');
    await wait(`document.querySelector('.react-flow__node, .chat-header')`);
    await openLibrary();
    assert.equal(await ev(`document.querySelector('.tree-list').dataset.layout`), layout);
    const ratios = [];
    for (const sel of [
      '.library-head h1',
      '.library-intro',
      '.tree-date-heading',
      '.volume .saved-chat-title',
      '.volume-date',
      '[id^=branch-count-]',
      '.volume .tree-row-actions',
    ]) {
      // The shelf menu button floats over the volume's paper band, which is not its DOM parent.
      const [fg, bg] = await pair(
          sel === '.volume .tree-row-actions' && layout === 'shelf' ? '.volume-band' : sel,
        ).then(async ([c, bg]) =>
          sel === '.volume .tree-row-actions'
            ? [
                await ev(
                  `getComputedStyle(document.querySelector('.volume .tree-row-actions')).color`,
                ),
                bg,
              ]
            : [c, bg],
        ),
        ratio = await contrast(fg, bg);
      assert.ok(
        ratio >= 4.5,
        `${appearance} ${layout}: ${sel} contrast ${ratio.toFixed(2)} (${fg} on ${bg})`,
      );
      ratios.push(ratio);
    }
    // Keyboard: Tab from the search reaches the layout switch, then every volume and its menu, with a paper ring.
    await b('focus', '.library-tools input');
    const reached = [];
    for (let i = 0; i < 12; i++) {
      await b('press', 'Tab');
      const f = await ev(
        `(() => { const a = document.activeElement, box = a.matches('.shelf .saved-chat-title') ? a.closest('.volume') : a, s = getComputedStyle(box); return { inside: !!a.closest('.library-content'), name: a.getAttribute('aria-label') || a.innerText.trim(), style: s.outlineStyle, width: parseFloat(s.outlineWidth), color: s.outlineColor }; })()`,
      );
      if (!f.inside) break;
      reached.push(f.name);
      assert.ok(
        f.style !== 'none' && f.width >= 2 && f.color === (await token('--treetutor-paper')),
        `${appearance} ${layout}: paper focus ring on ${f.name} ${JSON.stringify(f)}`,
      );
    }
    for (const [title] of expected)
      assert.ok(
        reached.includes(title) && reached.includes(`Actions for ${title}`),
        `${appearance} ${layout}: keyboard reaches ${title} and its menu: ${reached}`,
      );
    await b(
      'eval',
      "document.activeElement.blur(); document.querySelector('.library-panel').scrollTop = 0; true",
    );
    await shot(`${layout}-${appearance}`);
    steps.push(
      `${appearance} ${layout}: text and menu contrast >= ${Math.min(...ratios).toFixed(1)}:1; Tab reaches every volume and its menu with a paper focus ring`,
    );
  }
}

try {
  await b('set', 'viewport', '1400', '900');
  await b('open', url(app));
  await b('set', 'media', 'dark', 'reduced-motion');
  await b('eval', `localStorage.removeItem('treetutor.library-layout'); true`);
  await wait(`document.querySelector('.react-flow__node')`);
  await openLibrary();
  assert.equal(await ev(`document.querySelector('.library-panel h1').innerText`), 'Library');
  assert.equal(
    await ev(`document.querySelector('.tree-list').dataset.layout`),
    'shelf',
    'Shelf is the default',
  );
  assert.deepEqual(
    await titles(),
    expected.map(([t]) => t),
    'newest first',
  );
  assert.deepEqual(
    await ev(`[...document.querySelectorAll('.tree-date-heading')].map(e => e.innerText)`),
    ['Today', 'Yesterday', 'Previous 7 days', 'Older'],
  );
  const shelf = await ev(
    `[...document.querySelectorAll('.shelf .volume')].map(v => [v.querySelector('.saved-chat-title').innerText.trim(), v.querySelectorAll('.volume-spine i').length, v.querySelector('[id^=branch-count-]').innerText, v.querySelector('time').innerText])`,
  );
  assert.deepEqual(
    shelf.map(([t, n]) => [t, n]),
    expected,
    'one spine tick per conversation',
  );
  assert.deepEqual(
    shelf.map((v) => v[2]),
    [
      '5 conversations · 4 branches',
      '1 conversation · 0 branches',
      '2 conversations · 1 branch',
      '1 conversation · 0 branches',
    ],
  );
  assert.ok(
    shelf.every((v) => /^Started \d+ \w+/.test(v[3])),
    'each volume shows its date',
  );
  const inks = await Promise.all(
    [
      '--treetutor-paper',
      '--treetutor-ink-1',
      '--treetutor-ink-1',
      '--treetutor-ink-2',
      '--treetutor-ink-3',
    ].map(token),
  );
  assert.deepEqual(
    await ev(
      `[...document.querySelector('.shelf .volume .volume-spine').children].map(i => getComputedStyle(i).backgroundColor)`,
    ),
    inks,
    'trunk tick in paper, then each family in its series ink',
  );
  assert.equal(
    await ev(
      `document.querySelector('.volume[data-current=true] .saved-chat-title[aria-current=true]').innerText.trim()`,
    ),
    'How do fungi trade?',
  );
  steps.push(
    'Shelf (default): newest first under Today/Yesterday/Previous 7 days/Older; spine ticks 5/1/2/1 match conversation counts in family inks; title, date, conversation and branch counts; current tree marked',
  );

  await b('fill', '.library-tools input', 'FUNGI');
  await wait(`document.querySelectorAll('.saved-chat-title').length === 1`);
  assert.deepEqual(await titles(), ['How do fungi trade?']);
  await b('fill', '.library-tools input', 'zzz');
  await wait(
    `document.querySelector('.tree-list').innerText.includes('No learning tree titles match.')`,
  );
  await b('focus', '.library-tools input');
  await b('press', 'Control+a');
  await b('press', 'Backspace');
  await wait(`document.querySelectorAll('.saved-chat-title').length === 4`);
  steps.push(
    'Title search filters case-insensitively; no match shows "No learning tree titles match."',
  );

  await b('find', 'role', 'radio', 'click', '--name', 'List');
  await wait(`document.querySelector('.tree-list').dataset.layout === 'list'`);
  assert.deepEqual(
    await titles(),
    expected.map(([t]) => t),
    'List shows the same trees in the same order',
  );
  await b('eval', 'location.reload(); true');
  await wait(`document.querySelector('.react-flow__node')`);
  await openLibrary();
  assert.equal(
    await ev(`document.querySelector('.tree-list').dataset.layout`),
    'list',
    'the choice persists across reload',
  );
  assert.deepEqual(
    await titles(),
    expected.map(([t]) => t),
  );
  await click('Actions for Roman roads');
  await wait(
    `['Rename chat', 'Delete chat…'].every(n => [...document.querySelectorAll('[role=menuitem]')].some(e => e.innerText.trim() === n))`,
  );
  await b('find', 'role', 'menuitem', 'click', '--name', 'Delete chat…');
  await wait(
    `document.querySelector('[role=alertdialog]')?.innerText.includes('Delete chat “Roman roads”?') && document.activeElement?.textContent === 'Keep conversations'`,
  );
  await b('press', 'Enter');
  await wait(
    `!document.querySelector('[role=alertdialog]')?.checkVisibility() && document.activeElement?.getAttribute('aria-label') === 'Actions for Roman roads'`,
  );
  await click('Actions for Roman roads');
  await b('find', 'role', 'menuitem', 'click', '--name', 'Rename chat');
  await b('find', 'label', 'Conversation title', 'fill', 'Roman roads, renamed');
  await b('press', 'Enter');
  await wait(
    `document.getElementById('chat-actions-${roads.id}')?.getAttribute('aria-label') === 'Actions for Roman roads, renamed'`,
  );
  assert.equal(store.tree(roads.id).title, 'Roman roads, renamed');
  store.rename?.(roads.id, 'Roman roads');
  await b('eval', 'location.reload(); true');
  await wait(`document.querySelector('.react-flow__node')`);
  await openLibrary();
  await b('find', 'role', 'radio', 'click', '--name', 'Shelf');
  await wait(`document.querySelector('.tree-list').dataset.layout === 'shelf'`);
  steps.push(
    'List shows the same trees in the same order; the choice survives reload; Rename chat and Delete chat… keep their menu, confirmation and focus return',
  );

  // A volume opens its tree in Read, even when it was saved on the map; clicking the spine area counts.
  const spine = await ev(
    `(() => { const r = [...document.querySelectorAll('.shelf .volume')].find(v => v.innerText.includes("Bayes")).querySelector('.volume-spine'); r.scrollIntoView({ block: 'center' }); const box = r.getBoundingClientRect(); return [Math.round(box.x + 2), Math.round(box.y + 2)]; })()`,
  );
  await b('mouse', 'move', String(spine[0]), String(spine[1]));
  await b('mouse', 'down');
  await b('mouse', 'up');
  await wait(
    `document.querySelector('.tree-switcher').innerText.includes("Bayes") && !document.querySelector('main.conversation').hidden`,
  );
  await wait(`document.querySelector('.chat-title h2')?.textContent === "Bayes' rule, slowly"`);
  assert.deepEqual(
    await ev(
      `[...document.querySelectorAll('.shell-band [aria-current=page]')].map(e => e.innerText.trim())`,
    ),
    ['Read'],
  );
  steps.push(
    'Opening a volume (click anywhere on it) opens that tree in Read; the band switcher shows its title',
  );

  await checkAppearance('dark');
  await b('eval', `localStorage.setItem('treetutor.appearance', 'light'); true`);
  await b('set', 'media', 'light', 'reduced-motion');
  await checkAppearance('light');

  await b('open', url(empty));
  for (const appearance of ['light', 'dark']) {
    await b('set', 'media', appearance, 'reduced-motion');
    await b(
      'eval',
      `localStorage.setItem('treetutor.appearance', '${appearance}'); location.reload(); true`,
    );
    await wait(`document.querySelector('.empty-map')`);
    await b('click', '.tree-switcher');
    await wait(
      `document.querySelector('.library-panel')?.innerText.includes('Your first tree starts with a question.')`,
    );
    assert.equal(
      await ev(`!!document.querySelector('.shelf, .library-list, .library-tools')`),
      false,
      'no empty shelf',
    );
    await shot(`empty-${appearance}`);
  }
  steps.push(
    'No trees: the first-run prompt and New chat show instead of an empty shelf or search',
  );
  writeFileSync(
    `${verifyOut}/library-results.json`,
    JSON.stringify(
      { kind: 'built-app fixture (fake provider)', date: new Date().toISOString(), steps },
      null,
      2,
    ) + '\n',
  );
  console.log(steps.map((s) => `ok - ${s}`).join('\n'));
} finally {
  await b('close').catch(() => {});
  app.server.close();
  empty.server.close();
}
