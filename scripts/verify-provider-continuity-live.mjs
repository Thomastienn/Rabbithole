import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile, execFileSync } from 'node:child_process';
import lockfile from 'proper-lockfile';
import { Auth } from '../server/auth.mjs';
import { Codex } from '../server/codex.mjs';
import { Claude } from '../server/claude.mjs';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

// Explicit live check (native Claude Code login + app-owned ChatGPT consent), synthetic facts only.
// Without arguments it runs phase "before" and phase "after" as two separate processes sharing one data dir,
// so the server, store and both provider subprocesses really restart in between. Stop the app first (lock).
const [phase, dir] = process.argv.slice(2);
if (!phase) {
  const data = mkdtempSync(join(tmpdir(), 'treetutor-continuity-'));
  const run = p => JSON.parse(execFileSync(process.execPath, [process.argv[1], p, data], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], timeout: 1200000 }));
  console.log(JSON.stringify({ result: 'PASS', before: run('before'), after: run('after') }, null, 2));
  process.exit(0);
}

process.umask(0o077);
const authDir = process.env.TREETUTOR_DATA_DIR ?? join(process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), 'treetutor');
const release = await lockfile.lock(authDir, { realpath: true, stale: 10000 });
const store = new Store(join(dir, 'trees.sqlite'));
const auth = new Auth(authDir);
const app = createApp({ store, auth, providers: { claude: new Claude(dir), codex: new Codex(auth, dir) }, defaultProvider: 'claude' });
const ids = phase === 'after' ? JSON.parse(readFileSync(join(dir, 'ids.json'), 'utf8')) : {};
const report = { phase, pid: process.pid, date: new Date().toISOString(), turns: [] };
const exec = promisify(execFile);
const session = `treetutor-continuity-${process.pid}`;
const browser = async (...args) => (await exec('agent-browser', ['--session', session, ...args])).stdout;
const evaluate = async expression => JSON.parse(await browser('eval', expression, '--json')).data.result;
let origin, csrf;
const post = (path, body) => fetch(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf }, body: JSON.stringify(body) });
const switchTo = async (id, provider, model) => { const r = await post(`/api/trees/${id}/model`, { provider, model }); return { status: r.status, body: await r.json() }; };
// Streams one turn; onText may stop it. Returns the saved reply plus stream evidence.
async function ask(id, text, { expect = [], forbid = [], onText, status: wanted = 'completed' } = {}) {
  const started = performance.now(), before = store.tree(id);
  const response = await post(`/api/trees/${id}/messages`, { text });
  assert.equal(response.status, 200);
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = '', texts = 0, status, error;
  for (let chunk; !(chunk = await reader.read()).done;) {
    buffer += decoder.decode(chunk.value, { stream: true });
    for (let end; (end = buffer.indexOf('\n\n')) >= 0; buffer = buffer.slice(end + 2)) {
      const frame = buffer.slice(0, end);
      if (!frame.startsWith('data: ')) continue;
      const event = JSON.parse(frame.slice(6));
      if (event.type === 'text') { texts++; await onText?.(); }
      if (event.type === 'error') error = event.error;
      if (event.type === 'done') status = event.status;
    }
  }
  const tree = store.tree(id), reply = tree.messages.at(-1);
  assert.equal(status, wanted, error ?? reply.text);
  assert.equal(reply.status, wanted);
  for (const fact of expect) assert.ok(reply.text.includes(fact), `Missing ${fact}: ${reply.text}`);
  for (const fact of forbid) assert.ok(!reply.text.includes(fact), `Leaked ${fact}: ${reply.text}`);
  const turn = { tree: tree.title, provider: before.provider, model: tree.model, resumed: !!before.thread && before.thread === tree.thread, textEvents: texts, status, error, elapsedMs: Math.round(performance.now() - started), reply: reply.text.slice(0, 300) };
  report.turns.push(turn);
  return { tree, reply, error };
}
// Branch from a whole completed reply sentence containing `word`.
async function branch(parent, word, question) {
  const source = store.tree(parent).messages.findLast(m => m.role === 'assistant' && m.status === 'completed');
  const start = Math.max(0, source.text.indexOf(word)), end = Math.min(source.text.length, start + Math.max(word.length, 1));
  const r = await post(`/api/trees/${parent}/branches`, { messageId: source.id, start, end, text: source.text.slice(start, end), question });
  assert.equal(r.status, 201, await r.clone().text());
  return r.json();
}
const signedOut = async fn => { const saved = process.env.CLAUDE_CONFIG_DIR; process.env.CLAUDE_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'treetutor-signed-out-')); try { return await fn(); } finally { if (saved === undefined) delete process.env.CLAUDE_CONFIG_DIR; else process.env.CLAUDE_CONFIG_DIR = saved; } };

try {
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${app.server.address().port}`;
  ({ csrf } = await (await fetch(`${origin}/api/state`)).json());
  const catalog = await (await fetch(`${origin}/api/models`)).json();
  assert.ok(catalog.providers.claude.connected && catalog.providers.codex.connected, 'Both native sign-ins required');
  const codexModels = catalog.models.filter(m => m.provider === 'codex');
  report.models = { claude: catalog.models.filter(m => m.provider === 'claude').map(m => m.model), codex: codexModels.map(m => m.model), defaultProvider: catalog.defaultProvider };
  const codexDefault = (codexModels.find(m => m.isDefault) ?? codexModels[0]).model;

  if (phase === 'before') {
    // Second root first, so the map opens the main root (newest) for the browser step.
    // Only one unstarted chat exists at a time, so the other root asks its first question before the main root is created.
    const other = await (await post('/api/trees', {})).json();
    await ask(other.id, 'Remember this fictional fact: our comet is named Zircon-555. Confirm in one short sentence.', { expect: ['Zircon-555'] });
    const root = await (await post('/api/trees', {})).json();
    assert.deepEqual([root.provider, other.provider], ['claude', 'claude'], 'new trees default to Claude');
    await ask(root.id, 'For this study session remember these fictional facts: our robot is named Quill-482 and it sorts pebbles by weight. In two sentences, explain what sorting pebbles by weight means for Quill-482.', { expect: ['Quill-482'] });
    const rootThread = store.tree(root.id).thread;
    assert.ok(rootThread);
    await ask(root.id, 'What is our robot called? Reply with only the name.', { expect: ['Quill-482'] });
    assert.equal(store.tree(root.id).thread, rootThread, 'Claude resumed the same session');

    // Two independent Claude sessions at once; cancel the root mid-stream while the other completes.
    let stopped = false;
    const [cancelled, peer] = await Promise.all([
      ask(root.id, 'Write a detailed 600-word explanation of comparison sorting algorithms, using our robot as the running example.', { status: 'interrupted', onText: async () => { if (!stopped) { stopped = true; await post(`/api/trees/${root.id}/stop`, {}); } } }),
      ask(other.id, 'Name our comet. If this conversation never named a robot, say "no robot". One sentence.', { expect: ['Zircon-555'], forbid: ['Quill-482'] }),
    ]);
    assert.notEqual(store.tree(other.id).thread, rootThread, 'distinct Claude sessions');
    assert.equal(cancelled.reply.status, 'interrupted');
    await ask(root.id, 'Retry: what is our robot called? Reply with only the name.', { expect: ['Quill-482'], forbid: ['Zircon-555'] });
    assert.equal(store.tree(root.id).thread, rootThread);
    report.isolation = { cancelledRoot: 'interrupted', peerCompleted: peer.reply.status, distinctSessions: true, rootRetryResumed: true };

    // Claude child and grandchild inherit provider/model and a fixed compact snapshot.
    const rootMessages = store.tree(root.id).messages.length;
    const child = await branch(root.id, 'Quill-482', 'What would our robot do with two pebbles of equal weight?');
    assert.deepEqual([child.provider, child.model], ['claude', store.tree(root.id).model]);
    assert.match(child.branch.snapshot, /Quill-482/);
    await ask(child.id, 'Also remember: the robot battery is called Ember-77. What is our robot named? Answer briefly.', { expect: ['Quill-482'] });
    const grand = await branch(child.id, 'Ember-77', 'Where does our robot work?');
    assert.equal(grand.provider, 'claude');
    assert.match(grand.branch.snapshot, /Ember-77/);
    await ask(grand.id, 'Remember: the robot works in a lab named Kestrel-19. Which robot name and battery name do you know from earlier context? Answer in one sentence.', { expect: ['Quill-482', 'Ember-77'] });
    assert.equal(store.tree(root.id).messages.length, rootMessages, 'child turns never enter parent history');
    assert.ok(!store.tree(root.id).messages.some(m => /Ember-77|Kestrel-19/.test(m.text)));

    // Keyboard switch of the nested child to Codex while the root has an active Claude turn.
    execFileSync('npm', ['run', 'build'], { stdio: 'ignore' });
    const rootTurn = ask(root.id, 'In about 200 words, explain stable sorting with our robot as the example. Mention its name.', { expect: ['Quill-482'] });
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.equal((await switchTo(root.id, 'codex', codexDefault)).status, 409, 'active turn keeps its provider');
    await browser('open', origin);
    await browser('set', 'media', 'light', 'reduced-motion');
    await browser('wait', `[aria-label="Open ${grand.title}"]`);
    await browser('find', 'role', 'button', 'click', '--name', 'Fit tree', '--exact');
    await browser('wait', '--fn', `(() => { const e = document.querySelector('[aria-label="Open ${grand.title}"]'), r = e.getBoundingClientRect(); return e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })()`);
    await browser('find', 'role', 'button', 'click', '--name', `Open ${grand.title}`, '--exact');
    await browser('wait', '--fn', "!!document.querySelector('[aria-label=\"Model for next reply\"]')");
    await browser('focus', '[aria-label="Model for next reply"]');
    await browser('press', 'Space');
    await browser('wait', '--fn', "document.activeElement?.getAttribute('role') === 'menuitemradio'");
    const label = codexModels.find(m => m.model === codexDefault).label;
    for (let i = 0; i < 20 && await evaluate('document.activeElement?.textContent.trim()') !== label; i++) await browser('press', 'ArrowDown');
    assert.equal(await evaluate('document.activeElement?.textContent.trim()'), label);
    await browser('press', 'Enter');
    for (let i = 0; i < 100 && store.tree(grand.id).provider !== 'codex'; i++) await new Promise(resolve => setTimeout(resolve, 50));
    assert.deepEqual([store.tree(grand.id).provider, store.tree(grand.id).model, store.tree(grand.id).thread], ['codex', codexDefault, null]);
    await browser('close');
    await rootTurn;
    assert.deepEqual([store.tree(root.id).provider, store.tree(root.id).thread], ['claude', rootThread], 'other conversation not rerouted');
    await ask(grand.id, 'List our robot name, battery name and lab name from our discussion. One sentence.', { expect: ['Quill-482', 'Ember-77', 'Kestrel-19'] });
    await ask(grand.id, 'Also remember: the robot favorite pebble is Onyx-303. Confirm in one short sentence.', { expect: ['Onyx-303'] });
    const codexThread = store.tree(grand.id).thread;

    // Auth loss: a switch while signed out is refused; a switch then losing sign-in rolls back to Codex.
    const history = store.tree(grand.id).messages;
    const refused = await signedOut(() => switchTo(grand.id, 'claude', 'sonnet'));
    assert.equal(refused.status, 502);
    assert.match(refused.body.error, /Sign in to Claude/);
    assert.equal((await switchTo(grand.id, 'claude', 'sonnet')).status, 200);
    const lost = await signedOut(() => ask(grand.id, 'Which pebble is the favorite?', { status: 'failed' }));
    assert.match(lost.error, /signed out\. Run claude in a terminal/);
    const after = store.tree(grand.id);
    assert.deepEqual([after.provider, after.model, after.thread], ['codex', codexDefault, codexThread], 'prior usable provider/model/session restored');
    assert.deepEqual(after.messages.slice(0, history.length), history, 'history retained');
    report.authFailure = { refusedSwitch: refused.body.error, lostDuringReply: lost.error, rolledBackTo: [after.provider, after.model] };
    writeFileSync(join(dir, 'ids.json'), JSON.stringify({ root: root.id, rootThread, grand: grand.id, codexThread, codexDefault }));
  } else {
    // Actual restart: new process, store and provider subprocesses. Change Codex model, then switch both ways.
    const { root, rootThread, grand, codexThread } = ids;
    assert.ok(!store.tree(grand).messages.some(m => m.status === 'streaming'));
    const second = codexModels.find(m => m.model !== ids.codexDefault).model;
    assert.equal((await switchTo(grand, 'codex', second)).status, 200);
    await ask(grand, 'Which favorite pebble and which lab did we mention? One sentence.', { expect: ['Onyx-303', 'Kestrel-19'] });
    assert.equal(store.tree(grand).thread, codexThread, 'Codex thread resumed after restart and model change');
    assert.equal((await switchTo(grand, 'claude', 'opus')).status, 200);
    await ask(grand, 'Name our robot, its battery, its lab and its favorite pebble. Then remember one more fact: its charger is called Flint-64.', { expect: ['Quill-482', 'Ember-77', 'Kestrel-19', 'Onyx-303'] });
    const claudeThread = store.tree(grand).thread;
    await ask(grand, 'Which favorite pebble again? Reply with only the name.', { expect: ['Onyx-303'] });
    assert.equal(store.tree(grand).thread, claudeThread, 'Claude resumed');
    assert.equal((await switchTo(grand, 'codex', second)).status, 200);
    await ask(grand, 'What is the robot charger called? Reply with only the name.', { expect: ['Flint-64'] });
    assert.notEqual(store.tree(grand).thread, codexThread, 'fresh Codex thread received the Claude discussion');
    await ask(root, 'After the restart: what is our robot called? Reply with only the name.', { expect: ['Quill-482'], forbid: ['Ember-77', 'Kestrel-19', 'Flint-64'] });
    assert.equal(store.tree(root).thread, rootThread, 'root Claude session resumed after restart');
    const messages = store.tree(grand).messages;
    assert.equal(new Set(messages.map(m => m.id)).size, messages.length);
    const users = messages.filter(m => m.role === 'user').map(m => m.text);
    assert.equal(new Set(users).size, users.length, 'no duplicated user messages');
    assert.deepEqual(messages.map(m => m.role), messages.map((_, i) => i % 2 ? 'assistant' : 'user'), 'ordered user/assistant pairs');
    report.history = { grandchildMessages: messages.length, statuses: messages.filter(m => m.role === 'assistant').map(m => m.status) };
  }
  assert.equal(app.active.size, 0);
  console.log(JSON.stringify(report));
} finally {
  app.stop(); store.close(); await release();
}
