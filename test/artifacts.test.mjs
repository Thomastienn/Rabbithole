import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';
import { Claude } from '../server/claude.mjs';
import { Codex } from '../server/codex.mjs';

const task = { title: 'Tournament tree', description: 'Pairs of winners advance to the root.', intent: 'Show two winners combining.', excerpt: 'A and B advance to the final.' };
const directive = '\n```treetutor-diagram\n' + JSON.stringify(task) + '\n```';
const source = 'flowchart TD\n  A[Winner A] --> C[Final]\n  B[Winner B] --> C';
const complete = (emit, text) => { emit({ type: 'item', item: 'answer', text }); emit({ type: 'status', status: 'completed' }); };
async function open(provider, options = {}) {
  const path = join(mkdtempSync(join(tmpdir(), 'tt-artifacts-')), 'trees.sqlite');
  const store = new Store(path);
  const app = createApp({ store, provider, auth: { status: () => ({ connected: true }) }, ...options });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const { csrf } = await (await fetch(`${origin}/api/state`)).json();
  return {
    store, app, origin, path,
    get: path => fetch(origin + path),
    post: (path, body = {}) => fetch(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf }, body: JSON.stringify(body) }),
    close: () => { app.stop(); store.close(); },
  };
}

test('diagram request saves an owned artifact and keeps directive, worker prompt and source out of tutor history', async () => {
  const calls = [];
  let env, reply;
  const provider = { generate: async (tree, text, emit, save) => {
    calls.push({ tree, text });
    if (!tree.id) {
      const pending = env.store.tree(reply.id).artifacts[0];
      assert.equal(pending.status, 'pending');
      assert.equal(pending.source, null);
      save('worker-thread-secret', 'worker-model');
      complete(emit, source);
    } else {
      save('tutor-thread-secret', 'fixture-model');
      const answer = calls.length === 1 ? 'Here is how winners advance.' + directive : 'Continuing the explanation.';
      // Split every character: no prefix of the hidden fence may reach SSE or storage.
      for (const ch of answer) emit({ type: 'delta', item: 'answer', text: ch });
      complete(emit, answer);
    }
  } };
  env = await open(provider);
  try {
    reply = env.store.create('Diagrams');
    env.store.thread(reply.id, 'tutor-thread-secret', 'fixture-model');
    env.store.message(reply.id, 'user', 'UNRELATED PRIVATE TRANSCRIPT', 'completed');
    const stream = await (await env.post(`/api/trees/${reply.id}/messages`, { text: 'Explain winners.' })).text();
    const saved = await (await env.get(`/api/trees/${reply.id}`)).json();
    assert.equal(saved.artifacts?.length, 1);
    const [artifact] = saved.artifacts;
    assert.equal(artifact.status, 'ready');
    assert.equal(artifact.kind, 'mermaid');
    assert.equal(artifact.conversation, reply.id);
    assert.equal(artifact.message, saved.messages.at(-1).id);
    assert.equal(artifact.title, task.title);
    assert.equal(artifact.description, task.description);
    assert.equal(artifact.source, source);
    assert.equal(saved.messages.at(-1).text.trim(), 'Here is how winners advance.');
    const worker = calls[1];
    assert.equal(worker.tree.thread, null);
    assert.equal(worker.tree.model, 'fixture-model');
    assert.equal(worker.tree.messages, undefined);
    assert.equal(worker.tree.branch, undefined);
    assert.deepEqual(Object.keys(worker.tree).sort(), ['instructions', 'model', 'provider', 'thread']);
    assert.doesNotMatch(JSON.stringify(worker), /tutor-thread-secret|UNRELATED PRIVATE TRANSCRIPT|Explain winners/);
    assert.deepEqual(JSON.parse(worker.text), task);
    assert.equal(saved.thread, null, 'raw native reply must not be resumed');
    assert.deepEqual([saved.model, saved.working_model, saved.working_thread], ['fixture-model', 'fixture-model', null]);
    assert.doesNotMatch(stream, /treetutor-diagram|\"intent\"|\"excerpt\"|worker-thread-secret/);
    for (const frame of stream.trim().split('\n\n')) {
      if (!frame.startsWith('data: ')) continue;
      const event = JSON.parse(frame.slice(6));
      if (event.type === 'text') assert.doesNotMatch(event.text, /`/);
    }
    await (await env.post(`/api/trees/${reply.id}/messages`, { text: 'Continue.' })).text();
    const next = calls.at(-1);
    assert.match(JSON.stringify(next.tree.messages), /Tournament tree|Pairs of winners/);
    assert.ok(JSON.stringify(next.tree.messages).includes(artifact.id));
    assert.doesNotMatch(JSON.stringify(next), /flowchart|Winner A|worker-thread-secret|treetutor-diagram|Show two winners|A and B advance/);
    assert.equal(next.tree.artifacts, undefined);
    const reopened = new Store(env.path);
    try { assert.deepEqual(JSON.parse(JSON.stringify(reopened.tree(reply.id))), await (await env.get(`/api/trees/${reply.id}`)).json()); }
    finally { reopened.close(); }
  } finally { env.close(); }
});

for (const name of ['claude', 'codex']) test(`${name} adapter generates diagrams in a fresh native session and imports only artifact metadata on continuation`, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tt-media-adapter-'));
  const calls = [];
  const launch = (command, args, options) => {
    const call = { command, args, options, input: [] };
    calls.push(call);
    const fixture = fileURLToPath(new URL('./protocol-fixture.mjs', import.meta.url));
    const child = spawn(process.execPath, [fixture, ...(command === 'claude' ? args : [])], options);
    if (command === 'claude') {
      assert.equal(options.env.ANTHROPIC_API_KEY, undefined);
      const end = child.stdin.end.bind(child.stdin);
      child.stdin.end = text => { call.input.push(text); return end(text); };
    } else {
      assert.equal(options.env.OPENAI_API_KEY, undefined);
      const write = child.stdin.write.bind(child.stdin);
      child.stdin.write = text => { call.input.push(JSON.parse(text)); return write(text); };
    }
    return child;
  };
  const provider = name === 'claude' ? new Claude(dir, launch) : new Codex({ token: async () => 'fixture-subscription-token' }, dir, launch);
  const env = await open(null, { providers: { [name]: provider }, defaultProvider: name });
  try {
    const tree = env.store.create('Native adapter fixture', name);
    env.store.model(tree.id, name === 'claude' ? 'sonnet' : 'fixture-model');
    env.store.message(tree.id, 'user', 'UNRELATED ADAPTER TRANSCRIPT', 'completed');
    const stream = await (await env.post(`/api/trees/${tree.id}/messages`, { text: 'diagram fixture request' })).text();
    let saved = env.store.tree(tree.id);
    assert.equal(saved.artifacts.length, 1);
    const artifact = saved.artifacts[0];
    assert.equal(artifact.status, 'ready', artifact.error);
    assert.equal(artifact.title, 'Rounds');
    assert.equal(artifact.source, 'flowchart TD\n  W1[Round one] --> W2[Final]');
    assert.doesNotMatch(saved.messages.at(-1).text, /treetutor-diagram/);
    assert.doesNotMatch(stream, /treetutor-diagram/);
    assert.equal(saved.thread, null);
    if (name === 'claude') {
      assert.equal(calls.length, 2);
      const system = call => call.args[call.args.indexOf('--system-prompt') + 1];
      assert.match(system(calls[0]), /treetutor-diagram/);
      assert.match(system(calls[1]), /one Mermaid diagram/);
      assert.doesNotMatch(calls[1].input[0] + system(calls[1]), /UNRELATED ADAPTER TRANSCRIPT|Earlier discussion|diagram fixture request/);
      assert.equal(calls[1].args.includes('--resume'), false);
      const sessions = calls.map(call => call.args[call.args.indexOf('--session-id') + 1]);
      assert.notEqual(sessions[0], sessions[1]);
      assert.equal(JSON.parse(calls[1].input[0]).intent, 'Show each round.');
      // Actual worker permissions, separate from transcript isolation: no tools, MCP, settings, slash commands or API key; one turn.
      const arg = flag => calls[1].args[calls[1].args.indexOf(flag) + 1];
      assert.equal(arg('--tools'), '');
      assert.equal(arg('--max-turns'), '1');
      assert.equal(arg('--mcp-config'), '{"mcpServers":{}}');
      assert.equal(arg('--setting-sources'), '');
      assert.ok(calls[1].args.includes('--strict-mcp-config') && calls[1].args.includes('--disable-slash-commands'));
    } else {
      const requests = calls[0].input;
      const starts = requests.filter(r => r.method === 'thread/start');
      assert.equal(starts.length, 2);
      assert.match(starts[1].params.baseInstructions, /one Mermaid diagram/);
      assert.equal(starts[1].params.threadId, undefined);
      const turns = requests.filter(r => r.method === 'turn/start');
      assert.notEqual(turns[0].params.threadId, turns[1].params.threadId);
      assert.equal(JSON.parse(turns[1].params.input[0].text).intent, 'Show each round.');
      assert.doesNotMatch(JSON.stringify(turns[1]), /UNRELATED ADAPTER TRANSCRIPT|diagram fixture request/);
      assert.ok(requests.filter(r => r.method === 'thread/inject_items').every(r => r.params.threadId !== turns[1].params.threadId));
      // Actual worker permissions: read-only sandbox, no approvals, tools disabled, and the worker's command request is denied.
      assert.equal(starts[1].params.sandbox, 'read-only');
      assert.equal(starts[1].params.approvalPolicy, 'never');
      for (const feature of ['shell_tool', 'apply_patch_freeform', 'js_repl', 'code_mode', 'apps', 'skills']) assert.ok(calls[0].args.includes(`features.${feature}=false`), feature);
      assert.ok(calls[0].args.includes('web_search="disabled"'));
      assert.deepEqual(Object.keys(calls[0].options.env).sort(), ['ACCESS_TOKEN', 'CODEX_HOME', 'PATH']);
      assert.equal(requests.find(r => r.id === 'worker-command')?.error?.code, -32601);
    }
    await (await env.post(`/api/trees/${tree.id}/messages`, { text: 'Continue artifact.' })).text();
    saved = env.store.tree(tree.id);
    assert.equal(saved.messages.at(-1).status, 'completed');
    const history = name === 'claude' ? calls[2].input[0] : JSON.stringify(calls[0].input.filter(r => r.method === 'thread/inject_items').at(-1));
    assert.match(history, /Rounds|round winners/);
    assert.ok(history.includes(artifact.id));
    assert.doesNotMatch(history, /flowchart|W1\[|Show each round|Frozen round excerpt|treetutor-diagram/);
  } finally { env.close(); }
});

test('invalid, unsafe and oversized worker results save honest failures without retaining source; chat remains usable', async () => {
  let output, asked = false;
  const env = await open({ generate: async (tree, text, emit) => {
    if (tree.id) complete(emit, asked ? 'You can continue learning.' : 'A diagram helps.' + directive);
    else {
      if (output === 'provider-error') throw new Error('Private provider diagnostic with credential-canary');
      if (output === 'not-completed') { emit({ type: 'item', item: 'answer', text: source }); emit({ type: 'status', status: 'failed' }); return; }
      if (output === 'too-many-items') { for (let i = 0; i < 33; i++) emit({ type: 'item', item: String(i), text: 'A' }); return; }
      if (Array.isArray(output)) for (const part of output) emit({ type: 'delta', item: 'answer', text: part });
      else emit({ type: 'item', item: 'answer', text: output });
      emit({ type: 'status', status: 'completed' });
    }
  } });
  const rejected = [
    ['not Mermaid at all', /Invalid Mermaid syntax/],
    ['flowchart TD\n A[unfinished', /Invalid Mermaid syntax/],
    ['flowchart TD\n A[Ok] --> B[Ok]\n click A callback', /Unsafe diagram source/],
    ['flowchart TD\n A[Ok]\n click A href "https://example.test"', /Unsafe diagram source/],
    ['flowchart TD\n A["<b>HTML</b>"]', /Unsafe diagram source/],
    ['flowchart TD\n A["#60;script#62;alert(1)#60;/script#62;"]', /Unsafe diagram source/],
    ['flowchart TD\n A["&#x3c;img src=x&#x3e;"]', /Unsafe diagram source/],
    ['flowchart TD\n A["&lt;b&gt;HTML&lt;/b&gt;"]', /Unsafe diagram source/],
    ['%%{init: {"securityLevel":"loose"}}%%\nflowchart TD\n A --> B', /Unsafe diagram source/],
    ['---\nconfig:\n securityLevel: loose\n---\nflowchart TD\n A --> B', /Unsafe diagram source/],
    ['flowchart TD\n A@{ img: "https://example.test/x.svg" }', /Unsafe diagram source/],
    ['flowchart TD\n A --> B; classDef evil fill:url(javascript:alert(1))', /Unsafe diagram source/],
    ['flowchart TD\n A --> B\n linkStyle 0 stroke:url(//example.test/x)', /Unsafe diagram source/],
    ['flowchart TD\n A["`[Open](/secret)`"]', /Unsafe diagram source/],
    ['sequenceDiagram\n participant A\n participant B\n link A: Site@https://example.test', /Unsafe diagram source/],
    ['flowchart TD\n A["' + 'x'.repeat(16384) + '"]', /exceeds 16 KiB/],
    ['flowchart TD\n A["' + '🌲'.repeat(4100) + '"]', /exceeds 16 KiB/],
    [Array.from({ length: 5 }, () => 'x'.repeat(4000)), /exceeds 16 KiB/],
    ['', /no source/],
    ['provider-error', /Diagram provider failed/],
    ['not-completed', /did not complete/],
    ['too-many-items', /exceeds 32 message items/],
  ];
  try {
    for (const [value, reason] of rejected) {
      output = value;
      const tree = env.store.create('Rejected output');
      const stream = await (await env.post(`/api/trees/${tree.id}/messages`, { text: 'Draw it.' })).text();
      const saved = await (await env.get(`/api/trees/${tree.id}`)).json();
      assert.equal(saved.messages.at(-1).status, 'completed', 'a diagram failure does not fail the tutor reply');
      assert.equal(saved.artifacts.length, 1);
      assert.equal(saved.artifacts[0].status, 'failed', String(value).slice(0, 50));
      assert.equal(saved.artifacts[0].source, null);
      assert.match(saved.artifacts[0].error, reason);
      assert.doesNotMatch(stream + JSON.stringify(saved), /credential-canary|Private provider diagnostic/);
      assert.equal(env.app.active.size, 0);
    }
    asked = true;
    const tree = env.store.list()[0];
    await (await env.post(`/api/trees/${tree.id}/messages`, { text: 'Continue.' })).text();
    assert.equal(env.store.tree(tree.id).messages.at(-1).text, 'You can continue learning.');
  } finally { env.close(); }
});

test('plain flowchart, sequence, class, state, ER and pie definitions pass the real parser', async () => {
  let output;
  const env = await open({ generate: async (tree, text, emit) => complete(emit, tree.id ? 'Plain diagram.' + directive : output) });
  try {
    for (const value of [
      'graph LR\n A --> B',
      'sequenceDiagram\n Alice->>Bob: Hello\n Bob-->>Alice: Hi',
      'classDiagram\n Animal <|-- Duck\n Animal : +int age',
      'stateDiagram-v2\n [*] --> Learning\n Learning --> [*]',
      'erDiagram\n TEACHER ||--o{ LESSON : teaches',
      'pie\n "First round" : 4\n "Final" : 2',
    ]) {
      output = value;
      const tree = env.store.create('Valid source');
      await (await env.post(`/api/trees/${tree.id}/messages`, { text: 'Diagram.' })).text();
      const artifact = env.store.tree(tree.id).artifacts[0];
      assert.equal(artifact.status, 'ready', artifact.error + ': ' + value);
      assert.equal(artifact.source, value);
    }
  } finally { env.close(); }
});

test('malformed requests are hidden and failed without sending transcript-shaped or oversized tasks to a worker', async () => {
  let request, workers = 0;
  const env = await open({ generate: async (tree, text, emit) => {
    if (!tree.id) { workers++; complete(emit, source); }
    else complete(emit, 'Visible answer.\n' + request);
  } });
  try {
    for (const value of [
      '```treetutor-diagram\n{broken json}\n```',
      '```treetutor-diagram\n' + JSON.stringify({ ...task, thread: 'must-not-pass' }) + '\n```',
      '```treetutor-diagram\n' + JSON.stringify({ ...task, excerpt: 'x'.repeat(1201) }) + '\n```',
      '```treetutor-diagram\n' + JSON.stringify(task),
      directive + directive,
      '```treetutor-diagram extra\n' + JSON.stringify(task) + '\n```',
    ]) {
      request = value;
      const tree = env.store.create('Bad request');
      const stream = await (await env.post(`/api/trees/${tree.id}/messages`, { text: 'Explain.' })).text();
      const saved = env.store.tree(tree.id);
      assert.doesNotMatch(stream, /treetutor-diagram|broken json|must-not-pass/);
      assert.equal(saved.messages.at(-1).text.trim(), 'Visible answer.');
      assert.equal(saved.artifacts[0].status, 'failed');
      assert.match(saved.artifacts[0].error, /Invalid diagram request/);
    }
    assert.equal(workers, 0);
  } finally { env.close(); }
});

test('artifact reads and message attachments enforce exact conversation ownership', async () => {
  const env = await open({ generate: async (tree, text, emit) => complete(emit, tree.id ? 'Rounds advance.' + directive : source) });
  try {
    const owner = env.store.create('Owner'), other = env.store.create('Other');
    await (await env.post(`/api/trees/${owner.id}/messages`, { text: 'Diagram.' })).text();
    const saved = env.store.tree(owner.id), artifact = saved.artifacts[0];
    assert.equal((await env.get(`/api/trees/${owner.id}/artifacts/${artifact.id}`)).status, 200);
    assert.equal((await env.get(`/api/trees/${other.id}/artifacts/${artifact.id}`)).status, 404);
    assert.equal((await env.get(`/api/artifacts/${artifact.id}`)).status, 404);
    assert.deepEqual((await (await env.get(`/api/trees/${other.id}`)).json()).artifacts, []);
    for (const key of ['artifactId', 'artifactIds', 'artifacts']) {
      assert.equal((await env.post(`/api/trees/${other.id}/messages`, { text: 'Attach.', [key]: key === 'artifactId' ? artifact.id : [artifact.id] })).status, 400);
    }
    assert.equal((await env.post(`/api/trees/${other.id}/artifacts`, { id: artifact.id, message: saved.messages.at(-1).id })).status, 404);
    assert.throws(() => env.store.pendingArtifact(other.id, artifact.message, 'Foreign', 'Should fail'), /does not belong/);
    assert.equal(env.store.finishArtifact(other.id, artifact.id, source), undefined);
    assert.equal(env.store.tree(other.id).messages.length, 0);
    assert.deepEqual(env.store.artifact(owner.id, artifact.id), artifact);
  } finally { env.close(); }
});

test('provider switches and branch compaction receive ready metadata only, with no failed artifact or generation work', async () => {
  const calls = [];
  const fake = name => ({
    models: async () => [{ model: name + '-model', isDefault: true }],
    generate: async (tree, text, emit, save) => {
      calls.push({ name, tree, text });
      if (!tree.id) complete(emit, text.startsWith('Compact') ? 'The tournament diagram shows rounds.' : source);
      else {
        save(name + '-tutor-thread', name + '-model');
        complete(emit, text === 'Draw.' ? 'Rounds advance.' + directive : 'More about rounds.');
      }
    },
  });
  const env = await open(null, { providers: { claude: fake('claude'), codex: fake('codex') }, defaultProvider: 'claude' });
  try {
    const tree = await (await env.post('/api/trees')).json();
    await (await env.post(`/api/trees/${tree.id}/messages`, { text: 'Draw.' })).text();
    let saved = env.store.tree(tree.id);
    const [artifact] = saved.artifacts;
    const failed = env.store.pendingArtifact(tree.id, artifact.message, 'FAILED PRIVATE TITLE', 'FAILED PRIVATE DESCRIPTION');
    env.store.finishArtifact(tree.id, failed.id, null, 'Failed worker detail.');
    for (const name of ['codex', 'claude']) {
      assert.equal((await env.post(`/api/trees/${tree.id}/model`, { provider: name, model: name + '-model' })).status, 200);
      await (await env.post(`/api/trees/${tree.id}/messages`, { text: 'Continue.' })).text();
      const call = calls.at(-1);
      assert.equal(call.tree.thread, null);
      assert.match(JSON.stringify(call.tree.messages), /Tournament tree|Pairs of winners/);
      assert.doesNotMatch(JSON.stringify(call), /flowchart|Winner A|Show two winners|A and B advance|FAILED PRIVATE|Failed worker detail/);
      assert.equal(call.tree.artifacts, undefined);
    }
    saved = env.store.tree(tree.id);
    const messageId = saved.messages[1].id;
    const response = await env.post(`/api/trees/${tree.id}/branches`, { messageId, start: 0, end: 6, text: 'Rounds', question: 'Why rounds?' });
    assert.equal(response.status, 201);
    const compaction = calls.at(-1);
    assert.equal(compaction.tree.thread, null);
    assert.match(compaction.text, /Tournament tree|Pairs of winners/);
    assert.ok(compaction.text.includes(artifact.id));
    assert.doesNotMatch(compaction.text, /flowchart|Winner A|Show two winners|A and B advance|FAILED PRIVATE|Failed worker detail/);
    const child = await response.json();
    assert.deepEqual(child.artifacts, []);
    assert.equal((await env.get(`/api/trees/${child.id}/artifacts/${artifact.id}`)).status, 404);
  } finally { env.close(); }
});

test('Stop and deadline abort diagram workers, bound uncooperative providers and ignore late results', async () => {
  for (const stop of [true, false]) {
    let started, release, workerSignal, lateEmit;
    const pending = new Promise(resolve => { started = resolve; });
    const env = await open({ generate: async (tree, text, emit, save, signal) => {
      if (tree.id) { save('tutor-session', 'fixture-model'); complete(emit, 'A diagram helps.' + directive); }
      else {
        workerSignal = signal; lateEmit = emit; started();
        await new Promise(resolve => { release = resolve; });
      }
    } }, { diagramTimeout: stop ? 10000 : 30 });
    try {
      const tree = env.store.create('Abort diagram');
      const response = await env.post(`/api/trees/${tree.id}/messages`, { text: 'Draw.' });
      const stream = response.text();
      await pending;
      assert.equal(env.store.tree(tree.id).artifacts[0].status, 'pending');
      assert.equal((await env.post(`/api/trees/${tree.id}/messages`, { text: 'Duplicate.' })).status, 409);
      if (stop) assert.equal((await env.post(`/api/trees/${tree.id}/stop`)).status, 200);
      await stream;
      const saved = env.store.tree(tree.id);
      assert.equal(workerSignal.aborted, true);
      assert.equal(saved.artifacts[0].status, 'failed');
      assert.match(saved.artifacts[0].error, stop ? /cancelled/ : /timed out/);
      assert.equal(saved.artifacts[0].source, null);
      assert.equal(saved.messages.at(-1).status, stop ? 'interrupted' : 'completed');
      assert.equal(saved.thread, null);
      assert.equal(env.app.active.size, 0);
      complete(lateEmit, source); release();
      await new Promise(resolve => setImmediate(resolve));
      assert.deepEqual(env.store.tree(tree.id), saved, 'late callbacks cannot change finished artifacts or reply');
    } finally { release?.(); env.close(); }
  }
});

test('stopping a partial directive hides its prefix and discards native session; ordinary code fences retain exact text', async () => {
  let release;
  const code = 'Example:\n```js\nconst rounds = 2;\n```';
  const env = await open({ generate: async (tree, text, emit, save) => {
    save('native-with-raw-prefix', 'fixture-model');
    if (text === 'Stop halfway.') {
      emit({ type: 'delta', item: 'answer', text: 'A useful reply.\n```treetutor-diag' });
      await new Promise(resolve => { release = resolve; });
    } else {
      for (const ch of code) emit({ type: 'delta', item: 'answer', text: ch });
      complete(emit, code);
    }
  } });
  try {
    const tree = env.store.create('Prefix');
    const response = await env.post(`/api/trees/${tree.id}/messages`, { text: 'Stop halfway.' });
    const stream = response.text();
    await env.post(`/api/trees/${tree.id}/stop`);
    assert.doesNotMatch(await stream, /treetutor-diag/);
    const stopped = env.store.tree(tree.id);
    assert.equal(stopped.thread, null);
    assert.equal(stopped.messages.at(-1).text.trim(), 'A useful reply.');
    assert.deepEqual(stopped.artifacts, []);
    release();
    await (await env.post(`/api/trees/${tree.id}/messages`, { text: 'Show normal code.' })).text();
    assert.equal(env.store.tree(tree.id).messages.at(-1).text, code);
  } finally { release?.(); env.close(); }
});

test('restart fails orphaned pending artifacts once, without replaying generation; chat stays usable', async () => {
  const calls = [];
  const env = await open({ generate: async (tree, text, emit) => { calls.push(tree.id ?? 'worker'); complete(emit, 'Ordinary follow-up.'); } });
  const tree = env.store.create('Crash recovery');
  env.store.message(tree.id, 'user', 'Draw.', 'completed');
  const reply = env.store.message(tree.id, 'assistant', 'Partial explanation.', 'streaming');
  const orphan = env.store.pendingArtifact(tree.id, reply, 'Rounds', 'Winners meet in the final.');
  env.close();
  // A second process opening the same file simulates the crash restart.
  const store = new Store(env.path);
  const recovered = store.tree(tree.id);
  assert.equal(recovered.artifacts.length, 1);
  assert.equal(recovered.artifacts[0].id, orphan.id);
  assert.equal(recovered.artifacts[0].status, 'failed');
  assert.equal(recovered.artifacts[0].source, null);
  assert.match(recovered.artifacts[0].error, /interrupted/);
  assert.equal(recovered.messages.at(-1).status, 'interrupted');
  store.close();
  const again = new Store(env.path);
  assert.deepEqual(again.tree(tree.id), recovered, 'reopening again changes nothing');
  again.close();
  const restored = new Store(env.path);
  const app = createApp({ store: restored, provider: { generate: async (t, text, emit) => { calls.push(t.id ?? 'worker'); complete(emit, 'Ordinary follow-up.'); } }, auth: { status: () => ({ connected: true }) } });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  try {
    const origin = `http://127.0.0.1:${app.server.address().port}`;
    const { csrf } = await (await fetch(`${origin}/api/state`)).json();
    const read = await (await fetch(`${origin}/api/trees/${tree.id}/artifacts/${orphan.id}`)).json();
    assert.deepEqual(read, { ...recovered.artifacts[0] });
    assert.equal(calls.length, 0, 'reading recovered state never starts inference');
    await (await fetch(`${origin}/api/trees/${tree.id}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf }, body: JSON.stringify({ text: 'Continue.' }) })).text();
    const after = restored.tree(tree.id);
    assert.deepEqual(calls, [tree.id], 'only the tutor reply runs; the failed diagram is not regenerated');
    assert.equal(after.messages.at(-1).status, 'completed');
    assert.deepEqual(after.artifacts, recovered.artifacts, 'no duplicate artifact');
  } finally { app.stop(); restored.close(); }
});

test('a stopped job cannot publish late results into another conversation running its own diagram', async () => {
  const workers = new Map();
  const env = await open({ generate: async (tree, text, emit, save, signal) => {
    if (tree.id) { complete(emit, `Reply for ${tree.title}.` + directive); return; }
    // Each worker sees only its frozen task; record its callbacks for later release.
    await new Promise(resolve => workers.set(workers.size ? 'B' : 'A', { emit, signal, resolve }));
  } });
  try {
    const a = env.store.create('A'), b = env.store.create('B');
    const streamA = env.post(`/api/trees/${a.id}/messages`, { text: 'Draw A.' }).then(r => r.text());
    while (!workers.has('A')) await new Promise(resolve => setTimeout(resolve, 5));
    const streamB = env.post(`/api/trees/${b.id}/messages`, { text: 'Draw B.' }).then(r => r.text());
    while (!workers.has('B')) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal((await env.post(`/api/trees/${a.id}/stop`)).status, 200);
    const textA = await streamA;
    assert.equal(workers.get('A').signal.aborted, true);
    assert.equal(workers.get('B').signal.aborted, false, 'stopping A leaves B running');
    // A's worker finishes late; B's finishes normally afterwards.
    complete(workers.get('A').emit, 'flowchart TD\n  X[LATE A] --> Y[Leak]'); workers.get('A').resolve();
    complete(workers.get('B').emit, source); workers.get('B').resolve();
    const textB = await streamB;
    const savedA = env.store.tree(a.id), savedB = env.store.tree(b.id);
    assert.equal(savedA.artifacts.length, 1);
    assert.equal(savedA.artifacts[0].status, 'failed');
    assert.equal(savedB.artifacts.length, 1);
    assert.equal(savedB.artifacts[0].status, 'ready');
    assert.equal(savedB.artifacts[0].source, source);
    assert.equal(savedB.messages.at(-1).status, 'completed');
    assert.doesNotMatch(JSON.stringify(savedB) + textB, /LATE A|Leak/);
    assert.doesNotMatch(JSON.stringify(savedA) + textA, /LATE A|Leak/);
    assert.doesNotMatch(textA, new RegExp(savedB.artifacts[0].id));
    assert.doesNotMatch(textB, new RegExp(savedA.artifacts[0].id));
    assert.equal((await env.get(`/api/trees/${a.id}/artifacts/${savedB.artifacts[0].id}`)).status, 404);
    assert.equal(env.app.active.size, 0);
  } finally { for (const w of workers.values()) w.resolve(); env.close(); }
});
