import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import lockfile from 'proper-lockfile';
import { Auth } from '../server/auth.mjs';
import { Codex } from '../server/codex.mjs';

// Explicit live check: uses the existing app-owned consent and sends synthetic content.
// Stop the app first: the lock protects its rotating OAuth refresh token.
process.umask(0o077);
const dir = process.env.TREETUTOR_DATA_DIR ?? join(process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), 'treetutor');
const release = await lockfile.lock(dir, { realpath: true, stale: 10000 });
const client = new Codex(new Auth(dir), mkdtempSync(join(tmpdir(), 'treetutor-history-')));
const report = { date: new Date().toISOString(), models: [], turns: [] };
const history = name => [
  { role: 'user', text: 'Assign our fictional learning tree a name.', status: 'completed' },
  { role: 'assistant', text: `Our fictional tree is named ${name}.`, status: 'completed' }
];
const a = { messages: history('Aster-731'), branch: { snapshot: 'The inherited copper grove contains exactly 47 trees.', text: 'copper grove' } };
const b = { messages: history('Beryl-962'), branch: { snapshot: 'The inherited silver grove contains exactly 83 trees.', text: 'silver grove' } };
const active = new Set();
let overlapped = false, stoppedWithPeerActive = false, sawADelta = false;
const stopA = new AbortController();
function interrupt() {
  if (sawADelta && active.has(a.thread) && active.has(b.thread) && !stopA.signal.aborted) {
    stoppedWithPeerActive = true;
    stopA.abort();
  }
}
const observe = message => {
  if (message.method === 'turn/started') {
    active.add(message.params.threadId);
    if (active.has(a.thread) && active.has(b.thread)) overlapped = true;
    interrupt();
  }
  if (message.method === 'turn/completed') active.delete(message.params.threadId);
};
client.listeners.add(observe);
async function turn(owner, tree, prompt, signal = new AbortController().signal) {
  const started = performance.now(), items = new Map();
  let status, deltas = 0;
  await client.generate(tree, prompt, event => {
    if (event.type === 'delta' || event.type === 'item') items.set(event.item, event.type === 'item' ? event.text : (items.get(event.item) ?? '') + event.text);
    if (event.type === 'delta') {
      deltas++;
      if (signal === stopA.signal) { sawADelta = true; interrupt(); }
    }
    if (event.type === 'status') status = event.status;
  }, (thread, model) => { tree.thread = thread; tree.model = model; }, signal);
  const text = [...items.values()].join('\n\n');
  report.turns.push({ owner, status, model: tree.model, elapsedMs: Math.round(performance.now() - started), deltas, characters: text.length, excerpt: text.slice(0, 350) });
  console.log(JSON.stringify(report.turns.at(-1)));
  return { text, status };
}
function recall(result, name, grove, count, foreign) {
  assert.equal(result.status, 'completed');
  for (const fact of [name, grove, count]) assert.ok(result.text.includes(fact), `Missing own fact: ${fact}`);
  assert.ok(!result.text.includes(foreign), 'Foreign owner content leaked');
}
const question = 'From our prior discussion and inherited context, what is our fictional tree name, grove material, and exact number of trees? Answer in one sentence. Do not guess missing facts.';
try {
  await client.ready();
  let cursor;
  do {
    const page = await client.rpc('model/list', { limit: 100, ...(cursor ? { cursor } : {}) });
    report.models.push(...page.data.map(m => ({ id: m.id, model: m.model, isDefault: m.isDefault })));
    cursor = page.nextCursor;
  } while (cursor);
  console.log(JSON.stringify({ models: report.models }));
  recall(await turn('A supplied history', a, question), 'Aster-731', 'copper', '47', 'Beryl-962');
  // No provider thread exists for B yet: its long response must use imported history.
  const long = 'Begin with our fictional tree name and inherited grove facts. Then give a detailed 1600-word lesson on binary trees, with numbered examples. Mention only our own tree and grove.';
  const [ar, br] = await Promise.all([
    turn('A interrupted', a, long, stopA.signal),
    turn('B independent', b, long)
  ]);
  assert.notEqual(a.thread, b.thread);
  assert.ok(overlapped && stoppedWithPeerActive, 'Need actual overlapping turns and peer active at interrupt');
  assert.equal(ar.status, 'interrupted');
  assert.ok(!ar.text.includes('Beryl-962'));
  recall(br, 'Beryl-962', 'silver', '83', 'Aster-731');
  // Restart only this isolated transport, proving persisted injected history survives.
  client.close();
  recall(await turn('A after transport restart', a, question), 'Aster-731', 'copper', '47', 'Beryl-962');
  recall(await turn('B after transport restart', b, question), 'Beryl-962', 'silver', '83', 'Aster-731');
  console.log(JSON.stringify({ result: 'PASS', distinctThreads: true, overlapped, stoppedWithPeerActive, ...report }, null, 2));
} finally {
  client.close();
  await release();
}
