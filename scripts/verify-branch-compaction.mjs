import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import lockfile from 'proper-lockfile';
import { Auth } from '../server/providers/auth.mjs';
import { Codex } from '../server/providers/codex.mjs';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

// Explicit live evaluation. Stop TreeTutor first; never run as part of npm test.
process.umask(0o077);
const dir =
  process.env.TREETUTOR_DATA_DIR ??
  join(process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), 'treetutor');
const release = await lockfile.lock(dir, { realpath: true, stale: 10000 });
const work = mkdtempSync(join(tmpdir(), 'treetutor-compaction-'));
const client = new Codex(new Auth(dir), work);
const path = join(work, 'trees.sqlite');
let store = new Store(path),
  app,
  origin,
  csrf,
  cancelNext = false;
const report = { date: new Date().toISOString(), cases: [] };
const provider = {
  model: (tree) => client.model(tree),
  generate: async (tree, text, emit, save, signal) => {
    if (!cancelNext) return client.generate(tree, text, emit, save, signal);
    cancelNext = false;
    const stop = new AbortController();
    return client.generate(
      tree,
      text,
      (event) => {
        emit(event);
        if (event.type === 'delta') stop.abort();
      },
      save,
      AbortSignal.any([signal, stop.signal]),
    );
  },
  close: () => client.close(),
};
async function start() {
  app = createApp({ store, auth: { status: () => ({ connected: true }) }, provider });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${app.server.address().port}`;
  csrf = (await (await fetch(`${origin}/api/state`)).json()).csrf;
}
const get = async (id) => (await fetch(`${origin}/api/trees/${id}`)).json();
const post = (route, body) =>
  fetch(`${origin}/api/trees${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf },
    body: JSON.stringify(body),
  });
async function ask(id, text) {
  const before = performance.now();
  const response = await post(`/${id}/messages`, { text });
  assert.equal(response.status, 200);
  await response.text();
  const tree = await get(id);
  assert.equal(tree.messages.at(-1).status, 'completed');
  return { tree, elapsedMs: Math.round(performance.now() - before) };
}
async function branch(label, parent, start, end, question, cancel = false) {
  const source = parent.messages.at(-1);
  const anchor = {
    messageId: source.id,
    start,
    end,
    text: source.text.slice(start, end),
    question,
  };
  assert.ok(start >= 0 && end > start);
  const before = await get(parent.id),
    count = store.list().length;
  let cancelledMs;
  if (cancel) {
    cancelNext = true;
    const began = performance.now();
    assert.equal((await post(`/${parent.id}/branches`, anchor)).status, 500);
    cancelledMs = Math.round(performance.now() - began);
    assert.equal(store.list().length, count);
    assert.deepEqual(await get(parent.id), before);
    assert.equal(app.active.size, 0);
  }
  const began = performance.now();
  const response = await post(`/${parent.id}/branches`, anchor);
  const branchMs = Math.round(performance.now() - began);
  assert.equal(response.status, 201);
  const child = await response.json();
  assert.equal(store.list().length, count + 1);
  assert.equal(child.messages.length, 0);
  assert.equal(child.branch.text, anchor.text);
  assert.equal(child.branch.question, question);
  assert.equal(child.branch.messageId, source.id);
  assert.equal(child.branch.start, start);
  assert.equal(child.branch.end, end);
  assert.deepEqual(await get(parent.id), before);
  const answer = await ask(child.id, question);
  assert.equal(
    answer.tree.messages.filter((m) => m.role === 'user' && m.text === question).length,
    1,
  );
  assert.deepEqual(await get(parent.id), before);
  report.cases.push({
    label,
    model: answer.tree.model,
    source: source.text,
    anchor,
    snapshot: child.branch.snapshot,
    branchMs,
    answerMs: answer.elapsedMs,
    answer: answer.tree.messages.at(-1).text,
    ...(cancel
      ? {
          cancelledMs,
          cancellation:
            'Live compaction interrupted after first delta; HTTP 500, no child, parent unchanged; retry made one child and one question.',
        }
      : {}),
  });
  console.log(JSON.stringify({ label, branchMs, answerMs: answer.elapsedMs, cancelledMs }));
  return answer.tree;
}
try {
  await start();
  const root = await (await post('', {})).json();
  const initial = await ask(
    root.id,
    'Explain a tournament-tree mutual exclusion lock built from Peterson two-participant locks. Explain the role of flags and turn at each internal node, and how it differs from a winner-selection tournament tree. Use the exact phrase "tournament tree" in both explanations. Also note this unrelated fact: my fictional notebook is purple. Keep the answer under 450 words.',
  );
  report.root = {
    model: initial.tree.model,
    question: initial.tree.messages[0].text,
    answer: initial.tree.messages.at(-1).text,
    elapsedMs: initial.elapsedMs,
  };
  const text = report.root.answer;
  const peterson = text.toLowerCase().indexOf('peterson');
  assert.ok(peterson >= 0);
  const child = await branch(
    'Peterson local coordination',
    initial.tree,
    Math.max(0, peterson - 40),
    Math.min(text.length, peterson + 700),
    'Why are both flags and turn needed at one node? Distinguish local two-participant coordination from the whole tournament lock. Keep the answer under 300 words.',
    true,
  );
  const childText = child.messages.at(-1).text;
  const flag = childText.toLowerCase().indexOf('flag');
  assert.ok(flag >= 0);
  await branch(
    'Nested flag versus ownership',
    child,
    Math.max(0, flag - 40),
    Math.min(childText.length, flag + 450),
    'If my flag is true, does that mean I own the entire tournament lock, or only that I am competing at this node? Keep the answer under 250 words.',
  );
  // Anchor the repeated term nearest the winner-selection explanation.
  const winner = text.toLowerCase().lastIndexOf('winner');
  assert.ok(winner >= 0);
  const occurrences = [...text.matchAll(/tournament tree/gi)].map((m) => m.index);
  assert.ok(occurrences.length >= 2);
  const repeated = occurrences.reduce((a, b) =>
    Math.abs(a - winner) < Math.abs(b - winner) ? a : b,
  );
  await branch(
    'Repeated tournament terminology',
    initial.tree,
    repeated,
    repeated + 'tournament tree'.length,
    'Does this tournament tree need Peterson locks, or are these two different uses of the same name? Explain the winner-selection meaning at this occurrence. Keep the answer under 250 words.',
  );
  const snapshots = store
    .list()
    .map((t) => store.tree(t.id))
    .filter((t) => t.branch)
    .map((t) => ({ id: t.id, branch: t.branch }));
  await ask(
    root.id,
    'Later correction for this synthetic discussion: the notebook is now orange. Acknowledge briefly.',
  );
  for (const saved of snapshots) assert.deepEqual(store.tree(saved.id).branch, saved.branch);
  const records = await Promise.all(store.list().map((t) => get(t.id)));
  app.stop();
  store.close();
  store = new Store(path);
  await start();
  for (const record of records) assert.deepEqual(await get(record.id), record);
  report.checks = {
    exactAnchorsAndQuestions: true,
    parentHistoryUnchangedByBranch: true,
    cancellationAndRetry: true,
    oneQuestionPerChild: true,
    fixedSnapshotsAfterRootChange: true,
    recordsIdenticalAfterRestart: true,
  };
  console.log(JSON.stringify({ result: 'PASS', ...report }, null, 2));
} finally {
  app?.stop();
  client.close();
  store.close();
  await release();
}
