// Finish-review captures: all seven screens, dark and light, desktop and narrow, over a seeded fixture (synthetic providers, production build).
// Usage: node scripts/capture-finish.mjs [round]  → .impeccable/review/finish-<round>/<screen>-<scheme>-<width>.png
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

const round = process.argv[2] ?? '1';
const run = promisify(execFile), session = `finish-${process.pid}`;
const b = async (...args) => (await run('agent-browser', ['--session', session, ...args], { maxBuffer: 8 * 1024 * 1024 })).stdout;
const ev = async code => JSON.parse(await b('eval', code, '--json')).data.result;
const wait = code => b('wait', '--fn', code, '--timeout', '20000');
const click = name => b('find', 'role', 'button', 'click', '--name', name, '--exact');
const idle = `!document.getAnimations().some(a => a.playState === 'running' && a.effect?.getTiming().iterations !== Infinity)`;
const dir = mkdtempSync(join(tmpdir(), 'tt-finish-'));
const store = new Store(join(dir, 'trees.sqlite'));
store.create('Second chat', 'claude');
const root = store.create('How do fungi trade?', 'claude');
store.message(root.id, 'user', 'How do fungi trade with plants?', 'completed');
const reply = store.message(root.id, 'assistant', '## Trading partners\n\nMycorrhizal **fungi trade** phosphorus for sugar. The fungus threads its hyphae between root cells and extends the plant\'s reach into soil the roots alone could never explore.\n\n- Hyphae reach far\n- Roots pay in carbon\n\n```js\nconst trade = { give: "sugar", get: "phosphorus" };\n```\n\nThe exchange is policed: a root sends less sugar to a partner that delivers less phosphorus, so $E=mc^2$ is not involved.', 'completed');
store.finishArtifact(root.id, store.pendingArtifact(root.id, reply, 'Trade loop', 'Sugar flows to the fungus, phosphorus flows to the root.').id, 'flowchart LR\n R[Root] -->|sugar| F[Fungus]\n F -->|phosphorus| R');
const child = store.branch(store.tree(root.id), { messageId: reply, start: 35, end: 46, text: 'fungi trade', question: 'Why trade at all?' }, 'Root snapshot.');
store.message(child.id, 'user', 'Why trade at all?', 'completed');
const childReply = store.message(child.id, 'assistant', 'Neither partner can make what the other offers, so each pays in what it has in surplus.', 'completed');
const grand = store.branch(store.tree(child.id), { messageId: childReply, start: 0, end: 15, text: 'Neither partner', question: 'Could a plant go alone?' }, 'Child snapshot.');
store.message(grand.id, 'user', 'Could a plant go alone?', 'completed');
store.message(grand.id, 'assistant', 'Some do, in rich soil, but most land plants grow poorly without a partner.', 'interrupted');
store.addGraph({ concepts: [{ name: 'Mycorrhiza', topics: ['Ecology'] }, { name: 'Hyphae', topics: ['Ecology', 'Fungi'] }, { name: 'Phosphorus uptake', topics: ['Plant nutrition'] }], links: [{ from: 'Mycorrhiza', to: 'Hyphae', kind: 'related' }, { from: 'Mycorrhiza', to: 'Phosphorus uptake', kind: 'related' }] }, reply);
const fixture = { models: async () => [{ model: 'fixture', label: 'Fixture model', isDefault: true }, { model: 'fixture-2', label: 'Second model', isDefault: false }], generate: async (t, text, emit) => { emit({ type: 'item', item: 'answer', text: 'Fixture reply.' }); emit({ type: 'status', status: 'completed' }); } };
const signedOut = { models: async () => { throw new Error('signed out'); }, generate: async () => { throw new Error('signed out'); } };
const app = createApp({ store, providers: { claude: fixture, codex: signedOut }, defaultProvider: 'claude', dir, auth: { status: () => ({ connected: false, email: null }) } });
await new Promise(r => app.server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${app.server.address().port}`;
const out = resolve(`.impeccable/review/finish-${round}`);
mkdirSync(out, { recursive: true });
const files = [];
let scheme, width;
const shot = async screen => { await wait(idle); await wait(`document.fonts.status === 'loaded'`); const f = join(out, `${screen}-${scheme}-${width}.png`); await b('screenshot', f); files.push(f); console.log(f); };
const sizes = { desktop: [1440, 900], narrow: [390, 844] };
async function home() {
  await b('open', origin);
  await ev(`localStorage.setItem('treetutor.appearance', ${JSON.stringify(scheme)}); true`);
  await b('reload');
  await wait(`!!document.querySelector('[aria-label="Open How do fungi trade?"]')`);
}
const nav = async () => { await b('click', '.tree-switcher'); await wait(`!!document.querySelector('.saved-chat-title') && ${idle}`); };
const openChat = async () => { await click('Open How do fungi trade?'); await wait(`!!document.querySelector('.focused-chat .diagram-card[data-state=ready]')`); };
try {
  for (scheme of ['dark', 'light']) for (const [w, [vw, vh]] of Object.entries(sizes)) {
    width = w;
    await b('set', 'viewport', String(vw), String(vh));
    await b('set', 'media', scheme, 'reduced-motion');
    await home(); await shot('1-map');
    await openChat(); await shot('2-chat');
    // Mermaid: enlarged diagram viewer over the dimmed slate overlay.
    await ev(`document.querySelector('.focused-chat .diagram-open').click(); true`); await wait(`!!document.querySelector('dialog[open] img, dialog[open] svg')`); await shot('7-mermaid');
    await b('press', 'Escape'); await wait(`!document.querySelector('dialog[open]')`);
    // Passage prompt anchored to a selection in the reply.
    await ev(`(() => { const t = document.querySelector('.chat-reply .reply-md p'), w = document.createTreeWalker(t, NodeFilter.SHOW_TEXT), n = w.nextNode(), r = document.createRange(); r.setStart(n, 0); r.setEnd(n, 11); getSelection().removeAllRanges(); getSelection().addRange(r); t.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); return true; })()`);
    await wait(`!![...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Ask about selection')`); await ev(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Ask about selection').click(); true`);
    await wait(`document.querySelector('.branch-form input') === document.activeElement`); await shot('6-dialog-passage-prompt');
    await b('press', 'Escape');
    await click('Model for next reply'); await wait(`[...document.querySelectorAll('[role=menu]')].some(e => e.checkVisibility())`); await shot('6-dialog-model-menu'); await b('press', 'Escape');
    // Child chat: the yellow passage underline, focused path and inherited section together.
    await home(); await click('Open Why trade at all?'); await wait(`document.querySelector('.focused-chat h2')?.textContent === 'Why trade at all?'`); await shot('2-chat-child');
    await home(); await nav();
    await click('Actions for How do fungi trade?'); await wait(`[...document.querySelectorAll('[role=menu]')].some(e => e.checkVisibility())`);
    await b('find', 'role', 'menuitem', 'click', '--name', 'Delete chat…', '--exact'); await wait(`!!document.querySelector('[role=alertdialog][open]')`); await shot('6-dialog-delete');
    await b('press', 'Escape'); await wait(`!document.querySelector('[role=alertdialog][open]')`);
    await home(); await nav();
    await b('click', '.tree-search'); await b('fill', 'dialog[open][aria-label="Search learning trees"] input', 'fungi'); await wait(`document.querySelectorAll('dialog[open][aria-label="Search learning trees"] [role=option]').length > 0`); await shot('3-sidebar-search');
    await b('press', 'Escape'); await wait(`!document.querySelector('dialog[open][aria-label="Search learning trees"]')`); await shot('3-sidebar');
    await click('Settings'); await wait(`!!document.querySelector('dialog[open]')`);
    if (width === 'narrow') { await shot('4-settings-list'); await click('Interface'); }
    await wait(`document.querySelector('#settings-section-heading')?.textContent === 'Interface'`); await shot('4-settings');
    await b('press', 'Escape'); await wait(`![...document.querySelectorAll('dialog[open]')].some(d => d.textContent.includes('Appearance'))`);
    await nav(); await click('Knowledge'); await wait(`document.querySelectorAll('[data-concept]').length >= 3`); await shot('5-knowledge');
  }
  console.log(files.join('\n'));
} finally {
  await b('close').catch(() => {});
  app.stop(); store.close();
}
