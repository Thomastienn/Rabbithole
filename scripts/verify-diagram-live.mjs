// Live native check: one tutor-chosen Mermaid diagram through the signed-in Claude CLI.
// Records transcript isolation and actual worker launch permissions separately. Usage: node scripts/verify-diagram-live.mjs [out.json]
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { Store } from '../server/store.mjs';
import { Claude } from '../server/providers/claude.mjs';
import { createApp } from '../server/app.mjs';

const dir = mkdtempSync(join(tmpdir(), 'tt-diagram-live-'));
const canary = 'PRIVATE-CANARY-' + Date.now();
const launches = [];
const launch = (command, args, options) => {
  const child = spawn(command, args, options);
  const record = {
    args,
    cwd: options.cwd,
    apiKeyEnv: ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'].filter((k) => k in options.env),
    input: '',
  };
  const end = child.stdin.end.bind(child.stdin);
  child.stdin.end = (text) => {
    record.input = text;
    return end(text);
  };
  launches.push(record);
  return child;
};
const serve = async (store) => {
  const app = createApp({
    store,
    auth: { status: () => ({ connected: false }) },
    providers: { claude: new Claude(dir, launch) },
    defaultProvider: 'claude',
    diagramTimeout: 120000,
  });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const { csrf } = await (await fetch(origin + '/api/state')).json();
  const post = (path, body) =>
    fetch(origin + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf },
      body: JSON.stringify(body),
    }).then((r) => r.text());
  return { app, origin, post };
};
const check = (name, pass, detail) => {
  checks.push({ name, pass: !!pass, ...(detail && { detail }) });
};
const checks = [];
const path = join(dir, 'trees.sqlite');
let store = new Store(path);
const tree = store.create('Live diagram', 'claude');
store.model(tree.id, 'haiku');
store.message(tree.id, 'user', `Unrelated earlier note: ${canary}`, 'completed');
store.message(tree.id, 'assistant', 'Noted.', 'completed');
let { app, origin, post } = await serve(store);
const sse = await post(`/api/trees/${tree.id}/messages`, {
  text: 'Explain how a single-elimination tournament tree with 4 players decides a winner. A diagram of the rounds would really help here.',
});
let saved = store.tree(tree.id);
const [artifact] = saved.artifacts;
const worker = launches.find((l) =>
  l.args[l.args.indexOf('--system-prompt') + 1].startsWith('You create one Mermaid diagram'),
);
const tutor = launches[0];
check(
  'tutor reply completed',
  saved.messages.at(-1).status === 'completed',
  saved.messages.at(-1).status,
);
check(
  'one artifact linked to originating reply',
  saved.artifacts.length === 1 &&
    artifact.message === saved.messages.at(-1).id &&
    artifact.conversation === tree.id,
);
check(
  'artifact ready with validated source',
  artifact?.status === 'ready',
  artifact?.error ?? undefined,
);
check(
  'visible reply and SSE contain no directive',
  !/treetutor-diagram/.test(saved.messages.at(-1).text + sse),
);
check(
  'worker launched once with fresh session',
  !!worker &&
    !worker.args.includes('--resume') &&
    launches.filter((l) => l === worker).length === 1,
);
// Transcript isolation: the frozen task is the worker's whole input.
let task = null;
try {
  task = JSON.parse(worker.input);
} catch {}
check(
  'worker input is exactly the four-field task',
  task && Object.keys(task).sort().join() === 'description,excerpt,intent,title',
);
check(
  'worker input excludes unrelated transcript, learner message and tutor ids',
  !worker.input.includes(canary) &&
    !worker.input.includes('single-elimination tournament tree with 4 players') &&
    !worker.input.includes(tree.id) &&
    !worker.args.includes(tutor.args[tutor.args.indexOf('--session-id') + 1]),
);
// Actual worker permissions from the launched CLI arguments and environment.
const arg = (flag) => worker.args[worker.args.indexOf(flag) + 1];
check(
  'worker permissions: no tools, empty strict MCP, no settings or slash commands, one turn',
  arg('--tools') === '' &&
    arg('--max-turns') === '1' &&
    arg('--mcp-config') === '{"mcpServers":{}}' &&
    worker.args.includes('--strict-mcp-config') &&
    arg('--setting-sources') === '' &&
    worker.args.includes('--disable-slash-commands'),
);
check(
  'worker uses native subscription sign-in, no API key environment',
  worker.apiKeyEnv.length === 0,
);
const sessions = join(homedir(), '.claude', 'projects', worker.cwd.replace(/[^a-zA-Z0-9]/g, '-'));
const transcript = (id) => {
  const file = join(sessions, id + '.jsonl');
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
};
const workerLog = transcript(arg('--session-id'));
check(
  'worker native transcript has no tool use and no tutor transcript',
  workerLog !== null && !/"type":"tool_use"/.test(workerLog) && !workerLog.includes(canary),
  workerLog === null ? 'transcript not found' : undefined,
);
// Follow-up: the tutor receives only id/title/description metadata.
const before = launches.length;
await post(`/api/trees/${tree.id}/messages`, {
  text: 'What does the diagram you made show? One sentence.',
});
const follow = launches[before];
const followText = follow.input + follow.args[follow.args.indexOf('--system-prompt') + 1];
saved = store.tree(tree.id);
check(
  'follow-up imports artifact id/title/description',
  followText.includes(artifact.id) && followText.includes(artifact.title),
);
check(
  'follow-up excludes Mermaid source, intent, excerpt and worker prompt',
  !followText.includes(artifact.source) &&
    !followText.includes(task.intent) &&
    !followText.includes(task.excerpt) &&
    !followText.includes('You create one Mermaid diagram'),
);
check(
  'follow-up reply completed',
  saved.messages.at(-1).status === 'completed',
  saved.messages.at(-1).status,
);
const tutorLogs = launches
  .filter((l) => l !== worker)
  .map((l) => transcript(l.args[l.args.indexOf('--session-id') + 1]) ?? '')
  .join('\n');
check(
  'tutor native transcripts never contain Mermaid source',
  !tutorLogs.includes(artifact.source.split('\n').slice(1).join('\n').trim() || artifact.source),
);
// Restart: same artifact, no inference.
const snapshot = JSON.stringify(store.tree(tree.id));
app.stop();
store.close();
const count = launches.length;
store = new Store(path);
({ app, origin } = await serve(store));
const reopened = await (await fetch(`${origin}/api/trees/${tree.id}`)).json();
check(
  'restart reopens the same artifacts and messages without inference',
  JSON.stringify(reopened) === snapshot && launches.length === count,
);
app.stop();
store.close();
const result = {
  date: new Date().toISOString(),
  provider: 'claude (native CLI subscription sign-in)',
  model: 'haiku',
  launches: launches.length,
  artifact: {
    status: artifact.status,
    title: artifact.title,
    description: artifact.description,
    sourceSha256: artifact.source && createHash('sha256').update(artifact.source).digest('hex'),
    sourceFirstLine: artifact.source?.split('\n')[0],
  },
  checks,
  pass: checks.every((c) => c.pass),
};
console.log(JSON.stringify(result, null, 2));
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(result, null, 2) + '\n');
process.exit(result.pass ? 0 : 1);
