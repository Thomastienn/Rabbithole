// Built UI/HTTP/SQLite/focus fixture. Synthetic provider callbacks, no native inference or real learner data.
import { verifyOut } from './lib/output.mjs';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile, fork } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';

const filename = fileURLToPath(import.meta.url);
if (process.argv[2] === '--serve') {
  const store = new Store(join(process.argv[3], 'trees.sqlite')),
    turns = [];
  const provider = {
    models: async () => [{ model: 'fixture-model', label: 'Fixture model', isDefault: true }],
    generate: (tree, text, emit, save, signal) =>
      new Promise((resolve) => {
        emit({ type: 'delta', item: 'a', text: 'Fixture partial reply' });
        turns.push({ emit, save, signal, resolve });
      }),
  };
  const app = createApp({ store, provider, auth: { status: () => ({ connected: true }) } });
  process.on('message', (msg) => {
    if (msg === 'stop') {
      app.stop();
      store.close();
      process.exit(0);
    }
    if (msg === 'late')
      for (const turn of turns) {
        turn.emit({ type: 'item', item: 'a', text: 'Late fixture reply' });
        turn.emit({ type: 'status', status: 'completed' });
        turn.save('late-thread');
        turn.resolve();
      }
    if (msg === 'fail')
      store.db.exec(
        "CREATE TRIGGER fail_delete BEFORE DELETE ON trees BEGIN SELECT RAISE(ABORT, 'fixture failure'); END;",
      );
    if (msg === 'recover') store.db.exec('DROP TRIGGER fail_delete');
    process.send({ ack: msg });
  });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  process.send({ origin: `http://127.0.0.1:${app.server.address().port}`, pid: process.pid });
} else {
  const dir = mkdtempSync(join(tmpdir(), 'tt-management-browser-')),
    store = new Store(join(dir, 'trees.sqlite'));
  const other = store.create('Other saved chat'),
    background = store.create('Background chat'),
    root = store.create('Tournament roots');
  const source = store.message(
    root.id,
    'assistant',
    'Peterson locks connect tournament branches.',
    'completed',
  );
  const child = store.branch(
    root,
    { messageId: source, start: 0, end: 8, text: 'Peterson', question: 'Peterson branch' },
    'Fixture summary',
  );
  const childSource = store.message(child.id, 'assistant', 'Nested locks help.', 'completed');
  const grandchild = store.branch(
    child,
    { messageId: childSource, start: 0, end: 6, text: 'Nested', question: 'Nested branch' },
    'Nested fixture summary',
  );
  const sibling = store.branch(
    root,
    { messageId: source, start: 9, end: 14, text: 'locks', question: 'Sibling branch' },
    'Sibling fixture summary',
  );
  store.message(other.id, 'assistant', 'Another conversation.', 'completed');
  for (const t of [root, other])
    store.layout(t.id, { folded: [], selected: t.id, panel: 'beside' });
  store.close();
  const run = promisify(execFile),
    session = `chat-management-${process.pid}`;
  const b = async (...args) =>
    (await run('agent-browser', ['--session', session, ...args], { maxBuffer: 4 * 1024 * 1024 }))
      .stdout;
  const ev = async (expression) => JSON.parse(await b('eval', expression, '--json')).data.result;
  const wait = (expression) => b('wait', '--fn', expression, '--timeout', '30000');
  const click = (name) => b('find', 'role', 'button', 'click', '--name', name, '--exact');
  const item = (name) => b('find', 'role', 'menuitem', 'click', '--name', name, '--exact');
  const focusLabel = () =>
    ev('document.activeElement?.getAttribute("aria-label") || document.activeElement?.textContent');
  const checks = [],
    pass = (name, details = true) => {
      checks.push({ name, pass: true, details });
      console.log('PASS:', name);
    };
  let server, origin;
  async function start() {
    server = fork(filename, ['--serve', dir], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
    const [ready] = await once(server, 'message');
    origin = ready.origin;
    return ready;
  }
  async function stop() {
    const stopped = once(server, 'exit');
    server.send('stop');
    await stopped;
  }
  async function signal(msg) {
    const ack = once(server, 'message');
    server.send(msg);
    await ack;
  }
  const get = async (id) => (await fetch(`${origin}/api/trees/${id}`)).json();
  const view = () =>
    ev(
      `({title:document.querySelector('.chat-title h2')?.textContent,focus:document.activeElement?.getAttribute('aria-label')||document.activeElement?.textContent,alert:document.querySelector('section[role=alert]')?.textContent})`,
    );
  const dialog = 'document.querySelector("[role=alertdialog][open]")';
  const settle = () =>
    wait(
      `!document.getAnimations().some(a => a.playState==='running' && a.effect?.getTiming().iterations!==Infinity)`,
    );
  async function openMapDelete(label = 'Delete branch…') {
    await settle();
    await click('Map menu');
    await item(label);
    await wait(`${dialog} && document.activeElement?.textContent==='Keep conversations'`);
  }
  async function openNav() {
    await b('click', '.tree-switcher');
    await b('wait', '.saved-chat-title');
  }
  async function sidebarDelete(title) {
    await settle();
    await openNav();
    await wait(
      `(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===${JSON.stringify(`Actions for ${title}`)}),r=b?.getBoundingClientRect();return !!r&&b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})()`,
    );
    await click(`Actions for ${title}`);
    await item('Delete chat…');
    await wait(`${dialog} && document.activeElement?.textContent==='Keep conversations'`);
  }
  try {
    const first = await start();
    await b('set', 'viewport', '1280', '850');
    await b('open', origin);
    await b('wait', '[aria-label="Rename conversation"]');
    await click('Rename conversation');
    await b('find', 'label', 'Conversation title', 'fill', 'Renamed tournament');
    await b('press', 'Enter');
    await wait('document.querySelector(".chat-title h2")?.textContent==="Renamed tournament"');
    assert.equal(await focusLabel(), 'Rename conversation');
    await b('wait', '[aria-label="Open Renamed tournament"]');
    await openNav();
    await b('wait', '[aria-label="Renamed tournament · Learning trees"]');
    assert.equal((await get(root.id)).title, 'Renamed tournament');
    pass(
      'header rename by mouse/Enter updates header, band switcher, Library, map and SQLite and returns focus to the title',
    );

    await click('Actions for Other saved chat');
    await item('Rename chat');
    await b('find', 'label', 'Conversation title', 'fill', 'Other mouse');
    await click('Save title');
    await wait(
      `document.getElementById('chat-actions-${other.id}')?.getAttribute('aria-label')==='Actions for Other mouse'`,
    );
    await ev(`document.getElementById('chat-actions-${other.id}').focus()`);
    await b('press', 'Enter');
    await b('press', 'Home');
    await b('press', 'Enter');
    await b('find', 'label', 'Conversation title', 'fill', 'Other renamed');
    await b('press', 'Enter');
    await wait(
      `document.getElementById('chat-actions-${other.id}')?.getAttribute('aria-label')==='Actions for Other renamed'`,
    );
    assert.equal((await get(other.id)).title, 'Other renamed');
    pass('Library inline rename works by mouse and keyboard without selecting another chat');
    await sidebarDelete('Background chat');
    await b('press', 'Escape');
    await wait(`!${dialog}`);
    assert.equal(await ev('document.activeElement.id'), `chat-actions-${background.id}`);
    await sidebarDelete('Background chat');
    await click('Delete chat');
    await wait(`!${dialog}`);
    assert.equal((await view()).title, 'Renamed tournament');
    await wait(`document.activeElement?.id==='chat-actions-${root.id}'`);
    pass(
      'cancel from the Library restores its trigger; deleting a background chat keeps the open conversation and focuses its saved-chat action',
    );
    await click('Map');
    await wait(`getComputedStyle(document.querySelector('.focused-chat')).display==='none'`);

    await ev(`document.getElementById('open-${child.id}').focus()`);
    await b('press', 'Enter');
    await wait('document.querySelector(".chat-title h2")?.textContent==="Peterson branch"');
    await ev(`document.getElementById('rename-conversation').focus()`);
    await b('press', 'Enter');
    await b('find', 'label', 'Conversation title', 'fill', 'Discard this title');
    await b('press', 'Escape');
    assert.equal((await view()).title, 'Peterson branch');
    assert.equal(await focusLabel(), 'Rename conversation');
    await b('press', 'Enter');
    await b('find', 'label', 'Conversation title', 'fill', 'Renamed branch');
    await b('press', 'Enter');
    await wait('document.querySelector(".chat-title h2")?.textContent==="Renamed branch"');
    pass('branch header rename works by keyboard; Escape cancels locally and keeps chat open');
    await stop();
    const second = await start();
    await b('open', origin);
    await b('wait', '[aria-label="Open Renamed branch"]');
    for (const [id, title] of [
      [root.id, 'Renamed tournament'],
      [child.id, 'Renamed branch'],
      [other.id, 'Other renamed'],
    ])
      assert.equal((await get(id)).title, title);
    pass('all renamed titles survive a real fixture server/SQLite restart', {
      beforePid: first.pid,
      afterPid: second.pid,
    });

    await click('Open Renamed branch');
    await b('find', 'label', 'Your question', 'fill', 'Fixture streaming question');
    await b('press', 'Enter');
    await b('wait', '[aria-label="Stop"]');
    const parent = await get(root.id),
      siblingBefore = await get(sibling.id);
    await openMapDelete();
    const description = await ev(`${dialog}.textContent`);
    assert.ok(
      description.includes('Renamed branch') &&
        description.includes('2 conversations') &&
        description.includes('cannot be undone'),
    );
    await b('press', 'Shift+Tab');
    assert.equal(await focusLabel(), 'Delete branch');
    await b('press', 'Tab');
    assert.equal(await focusLabel(), 'Keep conversations');
    await b('press', 'Escape');
    await wait(`!${dialog}`);
    assert.equal(await focusLabel(), 'Map menu');
    assert.equal((await get(child.id)).messages.at(-1).status, 'streaming');
    pass(
      'confirmation names branch/count/no undo, initially focuses safe choice, traps Tab and Escape restores Map menu without stopping the reply',
    );
    await openMapDelete();
    mkdirSync('.impeccable/review', { recursive: true });
    await wait(
      `!document.getAnimations().some(a => a.playState==='running' && a.effect?.getTiming().iterations!==Infinity)`,
    );
    await b('screenshot', join(process.cwd(), '.impeccable/review/chat-management-desktop.png'));
    await b('set', 'viewport', '390', '844');
    await wait(
      `!document.getAnimations().some(a => a.playState==='running' && a.effect?.getTiming().iterations!==Infinity)`,
    );
    const geometry = await ev(
      `(()=>{const d=${dialog},r=d.getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth,focus:document.activeElement.textContent,overflow:document.documentElement.scrollWidth>innerWidth}})()`,
    );
    assert.ok(geometry.left >= 0 && geometry.right <= geometry.width && !geometry.overflow);
    assert.equal(geometry.focus, 'Keep conversations');
    await b('screenshot', join(process.cwd(), '.impeccable/review/chat-management-mobile.png'));
    pass('desktop and narrow confirmation stays within viewport with safe focus', geometry);
    await b('press', 'Shift+Tab');
    assert.equal(await focusLabel(), 'Delete branch');
    await b('press', 'Enter');
    await wait(
      `!${dialog} && document.querySelector('.chat-title h2')?.textContent==='Renamed tournament'`,
    );
    await wait('document.activeElement?.getAttribute("aria-label")==="Your question"');
    assert.deepEqual(await get(root.id), parent);
    assert.deepEqual(await get(sibling.id), siblingBefore);
    assert.equal((await fetch(`${origin}/api/trees/${child.id}`)).status, 404);
    assert.equal((await fetch(`${origin}/api/trees/${grandchild.id}`)).status, 404);
    await signal('late');
    assert.ok(!(await view()).alert);
    assert.equal((await view()).title, 'Renamed tournament');
    pass(
      'confirm during streaming deletes only branch/descendants, selects parent/composer, preserves sibling anchors and ignores late fixture callbacks',
    );

    await b('set', 'viewport', '1280', '850');
    await wait(
      `!!document.querySelector('.react-flow__edge[data-id="${sibling.id}"] .react-flow__edge-path')`,
    );
    const attachment = await ev(
      `(()=>{const h=document.querySelector('[data-source="${sibling.id}"]'),p=document.querySelector('.react-flow__edge[data-id="${sibling.id}"] .react-flow__edge-path'),r=h.getBoundingClientRect(),start=p.getPointAtLength(0).matrixTransform(p.getScreenCTM());return {message:h.closest('[data-message]')?.dataset.message,dx:Math.abs(start.x-r.right),dy:Math.abs(start.y-(r.top+r.height/2)),edges:document.querySelectorAll('.react-flow__edge').length}})()`,
    );
    assert.equal(attachment.message, source);
    assert.ok(attachment.dx < 8 && attachment.dy < 2);
    assert.equal(attachment.edges, 1);
    checks.at(-1).details = { siblingEdge: attachment };
    await click('Open Sibling branch');
    await signal('fail');
    await openMapDelete();
    await click('Delete branch');
    await wait(`${dialog}?.textContent.includes('Deletion failed:')`);
    assert.equal((await get(sibling.id)).id, sibling.id);
    assert.ok(await ev(`${dialog} !== null`));
    await b('press', 'Escape');
    await wait(`!${dialog}`);
    assert.equal(await focusLabel(), 'Map menu');
    await signal('recover');
    pass(
      'storage failure leaves data intact and confirmation open with retry/cancel; Escape restores focus',
    );

    await sidebarDelete('Renamed tournament');
    assert.ok((await ev(`${dialog}.textContent`)).includes('2 conversations'));
    await click('Delete chat');
    await wait(
      `!${dialog} && document.querySelector('.chat-title h2')?.textContent==='Other renamed'`,
    );
    await wait('document.activeElement?.getAttribute("aria-label")==="Your question"');
    pass('deleting open chat from the Library opens the next saved chat and focuses its composer');
    await sidebarDelete('Other renamed');
    await click('Delete chat');
    await wait(
      `!${dialog} && document.querySelector('.empty-map')?.textContent.includes('Your first tree starts with a question.')`,
    );
    await wait('document.activeElement?.textContent==="New chat"');
    assert.equal((await (await fetch(origin + '/api/state')).json()).trees.length, 0);
    pass('deleting the final chat opens New chat state and returns focus to New chat');
    // New chat saves nothing; the first question (200 characters) creates the tree and titles it.
    await b('press', 'Enter');
    await wait('!!document.activeElement?.closest(".first-question [role=textbox]")');
    await b('find', 'role', 'textbox', 'fill', '--name', 'Your question', 'x'.repeat(200));
    await b('press', 'Enter');
    await wait(`document.querySelector('.chat-title h2')?.textContent==='${'x'.repeat(200)}'`);
    await b('set', 'viewport', '390', '844');
    // Return to the map to reach its menu on a narrow viewport.
    await click('Return to tree');
    await openMapDelete('Delete chat…');
    const longTitle = await ev(
      `(()=>{const d=${dialog};return {width:d.clientWidth,content:d.scrollWidth,page:document.documentElement.scrollWidth,viewport:innerWidth}})()`,
    );
    assert.ok(longTitle.content <= longTitle.width && longTitle.page <= longTitle.viewport);
    await b('press', 'Escape');
    pass('maximum-length unbroken title remains inside a narrow confirmation', longTitle);
    const files = [
      'server/store.mjs',
      'server/app.mjs',
      'server/media/videos.mjs',
      'src/shell/ChatPage.tsx',
      'src/styles/states.css',
      'src/map/layoutSave.ts',
    ];
    writeFileSync(
      `${verifyOut}/chat-management-results.json`,
      JSON.stringify(
        {
          checkedAt: new Date().toISOString(),
          evidence:
            'Synthetic provider fixture; real production build, browser layout/focus, loopback HTTP, SQLite, and process restart. No native provider inference or learner data.',
          checks,
          sourceHashes: Object.fromEntries(
            files.map((path) => [
              path,
              createHash('sha256').update(readFileSync(path)).digest('hex'),
            ]),
          ),
        },
        null,
        2,
      ) + '\n',
    );
  } catch (error) {
    console.error(await b('snapshot', '-i').catch(() => 'snapshot unavailable'));
    console.error(
      await ev(
        `({dialogs:[...document.querySelectorAll('dialog')].map(d=>({open:d.open,text:d.textContent})),focus:document.activeElement?.getAttribute('aria-label')||document.activeElement?.id})`,
      ).catch(() => 'DOM unavailable'),
    );
    throw error;
  } finally {
    await b('close').catch(() => {});
    if (server?.exitCode === null) await stop();
  }
}
