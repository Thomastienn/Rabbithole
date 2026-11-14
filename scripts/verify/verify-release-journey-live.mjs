import assert from 'node:assert/strict';
import { existsSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  provider,
  out,
  session,
  b,
  ev,
  wait,
  click,
  hash,
  data,
  report,
  ok,
  CODE,
  ROOT,
  server,
  origin,
  start,
  stop,
  get,
  post,
  seen,
  ask,
  branch,
  loopback,
  node,
  h2,
  chatShown,
  view,
  settledView,
  flush,
  openTree,
  snapshot,
} from './lib/release-journey-fixture.mjs';

// Explicit live release journey (TreeTutor-7t3.12). Requires a built app (npm run build), agent-browser and a
// native Claude Code login, or --provider=codex with existing app-owned ChatGPT consent. Claude uses
// server/main.mjs; Codex uses the same app/store/providers in a worker so credentials stay in their original
// directory while synthetic trees and native session files stay in /tmp. Stop the owner app first (lock).
// Both modes restart the actual HTTP server process. No API keys or fixture providers.
// Usage: node scripts/verify/verify-release-journey-live.mjs [--provider=claude|codex] [report.json]
try {
  // Phase 1: first server process.
  const pid1 = await start();
  const port = new URL(origin).port;
  report.listener = { before: { pid: pid1, addresses: loopback(pid1) } };
  ok('real server process listens on loopback only', report.listener.before);
  await b('set', 'viewport', '1440', '900');
  await b('open', origin);
  await b('set', 'media', 'light', 'reduced-motion');
  await wait(
    `[...document.querySelectorAll('button')].some(e => e.getAttribute('aria-label') === 'Map menu')`,
  );
  await click('Map menu');
  await b('find', 'role', 'menuitem', 'click', '--name', 'Learning trees', '--exact');
  await click('New chat');
  await wait(
    `document.activeElement?.closest('.focused-chat [role=textbox]') !== null && document.querySelector('.focused-chat h2')?.textContent === 'New chat'`,
  );
  assert.equal(await ev(`document.querySelectorAll('.react-flow__node').length`), 1);
  ok('New chat shows one root box titled New chat with its chat open and the composer focused');
  const catalog = await get('/api/models');
  assert.equal(
    catalog.defaultProvider,
    'claude',
    'product default remains Claude in both scenarios',
  );
  if (provider === 'codex') {
    const model =
      catalog.models.find((m) => m.provider === provider && m.isDefault) ??
      catalog.models.find((m) => m.provider === provider);
    assert.ok(model, 'App-owned Codex login and available model required');
    await click('Model for next reply');
    await wait(
      `[...document.querySelectorAll('[role=menuitemradio]')].some(e => e.textContent.trim() === ${JSON.stringify(model.label)})`,
    ); // live catalogs load before the menu opens
    for (let i = 0; ; i++) {
      try {
        await b('find', 'role', 'menuitemradio', 'click', '--name', model.label, '--exact');
        break;
      } catch (e) {
        if (i === 4) throw e;
        await new Promise((r) => setTimeout(r, 1000));
      }
    } // popover may still be positioning
    await wait(
      `document.querySelector('.focused-chat')?.textContent.includes(${JSON.stringify(model.label + ' · ')}) && !document.querySelector('[aria-label="Model for next reply"]')?.hasAttribute('aria-busy')`,
    );
    await b('focus', '.focused-chat [role=textbox]');
  }
  await b('keyboard', 'type', ROOT);
  await click('Send');
  let root = (await get('/api/state')).trees.find((t) => t.title === ROOT);
  for (let i = 0; i < 480; i++) {
    root = await get(`/api/trees/${root.id}`);
    const reply = root.messages.at(-1);
    // A tutor-chosen diagram keeps the conversation active after the reply text completes.
    if (
      reply?.role === 'assistant' &&
      reply.status !== 'streaming' &&
      !(await get('/api/state')).active.includes(root.id)
    )
      break;
    await new Promise((r) => setTimeout(r, 500));
  }
  assert.equal(
    root.messages.at(-1)?.status,
    'completed',
    await ev(
      `document.querySelector('[role=alert]')?.textContent || 'First reply did not complete'`,
    ),
  );
  await wait(
    `${node(root.id)} && document.querySelector('.focused-chat')?.innerText.includes(${JSON.stringify(root.messages.at(-1).text.slice(0, 30))})`,
  );
  assert.equal(root.provider, provider);
  assert.deepEqual(
    root.messages.map((m) => [m.role, m.status]),
    [
      ['user', 'completed'],
      ['assistant', 'completed'],
    ],
  );
  ok('first question creates the root node; native reply streamed in chat', {
    provider: root.provider,
    model: root.model,
    productDefault: catalog.defaultProvider,
  });

  const child = await branch(root, 'Why does each match keep only the smaller value?');
  await ask(child.id, 'Answer in two sentences: why does each match keep only the smaller value?');
  const grand = await branch(
    await get(`/api/trees/${child.id}`),
    'How many comparisons does that take?',
  );
  await ask(
    grand.id,
    'In one sentence: how many comparisons does finding the minimum of eight take?',
  );
  assert.equal((await get(`/api/trees/${grand.id}`)).branch.parent, child.id);
  assert.deepEqual(
    (await get(`/api/trees/${root.id}`)).messages,
    root.messages,
    'child and grandchild replies never enter the parent',
  );
  ok('nested branches from exact passages (root → child → grandchild) with live replies');

  // Concurrency: two separate conversations generate at once while the browser keeps navigating.
  const second = await (await post('/api/trees', {})).json();
  if (provider === 'codex')
    assert.equal(
      (await post(`/api/trees/${second.id}/model`, { provider, model: root.model })).status,
      200,
    );
  await b('reload');
  await wait(`!!document.querySelector('[aria-label="Map menu"]')`);
  await openTree(ROOT);
  await wait(node(child.id));
  const t0 = Date.now();
  const both = Promise.all([
    ask(root.id, 'Explain the tournament minimum algorithm in eight short numbered steps.'),
    ask(
      second.id,
      'Explain how a binary heap differs from a tournament tree in eight short numbered points.',
    ),
  ]);
  both.catch(() => {}); // surfaced by the await below
  let active;
  for (let i = 0; i < 200; i++) {
    active = (await get('/api/state')).active;
    if (active.includes(root.id) && active.includes(second.id)) break;
    await new Promise((r) => setTimeout(r, 25));
  }
  assert.deepEqual(
    new Set(active),
    new Set([root.id, second.id]),
    'both replies active simultaneously',
  );
  await b('focus', `#open-${child.id}`);
  await b('press', 'Enter');
  await wait(`${h2} === ${JSON.stringify(child.title)}`);
  assert.ok(
    (await get('/api/state')).active.length > 0,
    'navigation completed while a native reply was active',
  );
  const [r1, r2] = await both;
  assert.notEqual(r1.id, r2.id);
  ok(
    'two conversations generated simultaneously; navigation stayed available; each reply saved to its own conversation',
    { ms: Date.now() - t0 },
  );

  // Layout: fold, move, zoom, select conversation, beside panel; one batched write on the controlled minute.
  await b('reload');
  await wait(`!!document.querySelector('[aria-label="Map menu"]')`);
  await openTree(ROOT);
  await wait(node(grand.id)); // selection is unsaved until the minute batch, so reopen the child after reload
  await b('focus', `#open-${child.id}`);
  await b('press', 'Enter');
  await wait(`${h2} === ${JSON.stringify(child.title)} && ${chatShown}`);
  await click(`Collapse descendants of ${child.title}`);
  await wait(`!${node(grand.id)}`);
  await click('Fit tree');
  await settledView();
  const box = await ev(
    `(() => { const r=document.querySelector('.react-flow__node[data-id="${root.id}"] .conversation-box').getBoundingClientRect(); return {x:Math.round(r.x+r.width/2), y:Math.round(r.bottom-4)}; })()`,
  );
  await b('mouse', 'move', String(box.x), String(box.y));
  await b('mouse', 'down', 'left');
  await b(
    'mouse',
    'move',
    String(box.x + 70),
    String(box.y + 40),
    '--duration',
    '250',
    '--steps',
    '12',
  );
  await b('mouse', 'up', 'left');
  await click('Zoom in');
  await settledView(); // the zoom animation is still a layout change, not an idle interval
  assert.equal(await ev('window.__layoutPosts'), 0, 'no write before the minute');
  await flush();
  const posts = await ev('window.__layoutPosts');
  // One write per touched root per minute: Tournament trees, plus Heap comparison that the reload opened first.
  assert.equal(posts, 2, 'fold, drag, zoom and selection coalesced into one write per tree');
  await new Promise((r) => setTimeout(r, 500));
  await flush();
  assert.equal(await ev('window.__layoutPosts'), posts, 'idle layout writes nothing');
  await click('Expand chat');
  await wait(`document.querySelector('.tree-workspace').dataset.expanded === 'true'`);
  await flush();
  const ui = {
    selected: await ev(h2),
    chat: await ev(chatShown),
    expanded: true,
    grandVisible: await ev(node(grand.id)),
    view: await settledView(),
  };
  ok('layout changes coalesce into one controlled-minute write; idle produces none', { posts });

  const before = await snapshot();
  assert.equal(Object.keys(before).length, 4);
  assert.deepEqual(before[ROOT].list.layout.folded, [child.id]);
  assert.equal(before[ROOT].list.layout.panel, 'expanded');
  assert.ok(
    Number.isFinite(before[ROOT].tree.x) && Number.isFinite(before[ROOT].tree.y),
    'dragged box position was saved',
  );
  assert.deepEqual(
    before[child.title].tree.branch,
    child.branch,
    'later parent messages leave child context frozen',
  );
  assert.deepEqual(
    before[grand.title].tree.branch,
    grand.branch,
    'grandchild context stays frozen',
  );
  report.saveLocation = {
    path: join(data, 'trees.sqlite'),
    exists: existsSync(join(data, 'trees.sqlite')),
    fileMode: (statSync(join(data, 'trees.sqlite')).mode & 0o777).toString(8),
    sessions:
      provider === 'claude'
        ? 'Claude Code sessions under the native ~/.claude config; app workspace <data>/claude-workspace'
        : 'Codex sessions <data>/codex; workspace <data>/workspace; credentials remain in original app-owned directory',
  };

  // Actual restart: stop the process, confirm the port is closed, start a new process on the same port.
  await stop();
  await assert.rejects(fetch(origin + '/api/state'), 'old server gone');
  const pid2 = await start(port);
  assert.notEqual(pid2, pid1);
  report.listener.after = { pid: pid2, addresses: loopback(pid2) };
  ok('server process actually restarted on the same loopback port', { pid1, pid2 });
  const after = await snapshot();
  assert.deepEqual(after, before);
  ok(
    'after restart: messages, exact anchors, frozen snapshots, positions, viewport, folds, selection, panel mode, provider/model/session identical',
    {
      trees: Object.keys(after).length,
      messages: Object.values(after).reduce((n, t) => n + t.tree.messages.length, 0),
      digest: hash(JSON.stringify(after)),
    },
  );
  await b('reload');
  await wait(`!!document.querySelector('[aria-label="Map menu"]')`);
  await openTree(ROOT);
  await wait(`${node(root.id)} && ${h2} === ${JSON.stringify(ui.selected)}`);
  assert.equal(await ev(chatShown), ui.chat);
  assert.equal(await ev(node(grand.id)), ui.grandVisible);
  assert.equal(
    await ev(`document.querySelector('.tree-workspace').dataset.expanded === 'true'`),
    ui.expanded,
  );
  assert.equal(await settledView(), ui.view, JSON.stringify(after[ROOT].list.layout));
  ok('browser after restart restores selected conversation, panel mode, fold and viewport', ui);

  if (provider === 'codex') {
    const saved = after[grand.title].tree;
    const next = (await get('/api/models')).models.find(
      (m) => m.provider === provider && m.model !== saved.model,
    );
    assert.ok(next, 'A second Codex model is required for saved nested model continuity');
    assert.equal(
      (await post(`/api/trees/${grand.id}/model`, { provider, model: next.model })).status,
      200,
    );
    const changed = await get(`/api/trees/${grand.id}`);
    assert.equal(changed.model, next.model);
    assert.deepEqual(
      { ...changed, model: saved.model },
      saved,
      'model change preserves nested history, context and session',
    );
    report.modelChange = { from: saved.model, to: next.model };
  }

  // Native saved-session and frozen-context semantic continuity, concurrently after restart.
  const [rootRecall, grandRecall] = await Promise.all([
    ask(
      root.id,
      'What bracket codename did I give you at the start? Reply with only the codename.',
    ),
    ask(
      grand.id,
      'Quote, word for word, the passage I selected to start this branch. Reply with only the quote.',
    ),
  ]);
  assert.match(rootRecall.text, new RegExp(CODE));
  const passage = after[grand.title].tree.branch.text;
  assert.ok(
    grandRecall.text.replace(/\s+/g, ' ').includes(passage.replace(/\s+/g, ' ')),
    `full exact branch passage recalled: ${grandRecall.text}`,
  );
  ok(
    'after restart: root continues prior discussion (codename recalled) and grandchild recalls its exact selected passage, concurrently',
    { root: rootRecall.text.trim().slice(0, 60) },
  );
  const final = await snapshot();
  if (provider === 'codex') {
    assert.equal(final[grand.title].tree.thread, before[grand.title].tree.thread);
    assert.equal(final[grand.title].tree.model, report.modelChange.to);
    assert.equal(final[ROOT].tree.model, before[ROOT].tree.model);
    ok(
      'saved nested Codex model change resumes the same session and recalls inherited passage without changing the parent model',
      report.modelChange,
    );
  }
  for (const [title, t] of Object.entries(before))
    assert.deepEqual(
      final[title].tree.messages.slice(0, t.tree.messages.length),
      t.tree.messages,
      `${title} history unchanged`,
    );
  assert.deepEqual(
    final[grand.title].tree.branch,
    before[grand.title].tree.branch,
    'frozen snapshot unchanged by later messages',
  );
  ok('later messages append without changing earlier history or frozen branch snapshots');

  // Credentials: no browser-visible body may contain provider secrets.
  const finalIds = Object.values(final)
    .map((t) => `id=${t.tree.id}`)
    .join('&');
  for (const path of ['/', '/api/models', `/api/previews?${finalIds}`]) {
    const r = await fetch(origin + path);
    seen.push([path, await r.text()]);
  }
  seen.push(['/api/auth', await (await post('/api/auth', {})).text()]);
  const html = seen.find(([p]) => p === '/')[1];
  for (const asset of html.match(/\/assets\/[^"]+/g) ?? [])
    seen.push([asset, await (await fetch(origin + asset)).text()]);
  const secret =
    /sk-ant-|access_token|refresh_token|id_token|"apiKey"|ANTHROPIC_API_KEY|eyJ[\w-]{10,}\.[\w-]{10,}\./;
  const leaks = seen.filter(([, body]) => secret.test(body)).map(([p]) => p);
  assert.deepEqual(leaks, []);
  ok('no provider credential patterns in any browser-visible response', {
    responses: seen.length,
  });
  report.result = 'PASS';
} catch (error) {
  report.result = 'FAIL';
  report.error = String(error?.stack ?? error).slice(0, 2000);
  try {
    report.snapshot = (await b('snapshot')).slice(0, 4000);
  } catch {}
  process.exitCode = 1;
} finally {
  await b('close').catch(() => {});
  if (server?.exitCode === null) await stop();
  writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify({
      result: report.result,
      checks: report.checks.length,
      error: report.error?.split('\n')[0],
    }),
  );
}
