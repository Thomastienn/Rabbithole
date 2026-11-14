// Seeded diagram artifacts, fixture server lifecycle and agent-browser helpers for verify-diagram-rendering.mjs.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { execFile, fork } from 'node:child_process';
import { Store } from '../../../server/store.mjs';

const dir = mkdtempSync(join(tmpdir(), 'tt-diagram-browser-'));
const store = new Store(join(dir, 'trees.sqlite'));
const stepsTree = store.create('Diagram steps'),
  states = store.create('Diagram states'),
  other = store.create('Other conversation'),
  root = store.create('Diagram fixture');
const text = 'repeat 😀 repeat 😀 end';
store.message(root.id, 'user', 'Seeded rounds question', 'completed');
const message = store.message(root.id, 'assistant', text, 'completed');
store.message(root.id, 'assistant', 'A second reply below the diagrams.', 'completed');
const add = (
  tree,
  msg,
  title,
  source,
  error,
  description = `${title}: winners advance from one round to the next.`,
) => {
  const artifact = store.pendingArtifact(tree, msg, title, description);
  return source || error ? store.finishArtifact(tree, artifact.id, source, error) : artifact;
};
const tall = add(
  root.id,
  message,
  'Tournament rounds',
  'flowchart TD\n' +
    Array.from(
      { length: 12 },
      (_, i) => ` N${i}[Round ${i + 1}] --> N${i + 1}[Round ${i + 2}]`,
    ).join('\n'),
);
const wide = add(
  root.id,
  message,
  'Rounds across the page',
  'flowchart LR\n' +
    Array.from(
      { length: 8 },
      (_, i) => ` N${i}[Round ${i + 1}] --> N${i + 1}[Round ${i + 2}]`,
    ).join('\n'),
);
const stepMessage = store.message(
  stepsTree.id,
  'assistant',
  'A seed absorbs water, sprouts roots, then grows leaves that make food from light.',
  'completed',
);
const stepIds = [
  [
    'Seed drinks water',
    'flowchart LR\n W[Water soaks in]:::blue -->|wakes up| S[Sleeping seed]:::yellow',
    'Water enters a seed and helps start germination.',
  ],
  [
    'Roots and shoot',
    '%% A plain Mermaid comment must not disable trusted colors\nflowchart TD\n S[Seed]:::yellow -->|pushes down| R[Root drinks]:::blue\n S -->|pushes up| H[Shoot reaches light]:::green',
    'A root grows down to absorb water; a shoot grows up toward light.',
  ],
  [
    'Leaves make food',
    'flowchart LR\n L[Sunlight]:::yellow --> F[Leaf kitchen]:::green\n F -->|makes| G[Sugar food]:::pink\n class F green',
    'A leaf uses light energy to make sugar from water and carbon dioxide.',
  ],
].map(
  ([title, source, description]) =>
    add(stepsTree.id, stepMessage, title, source, null, description).id,
);
const stateMessage = store.message(states.id, 'assistant', 'Saved artifact states.', 'completed');
add(states.id, stateMessage, 'Pending example');
add(
  states.id,
  stateMessage,
  'Failed example',
  null,
  'Diagram provider failed to generate a result.',
);
add(states.id, stateMessage, 'Render error', 'not valid Mermaid');
// Deliberately bypass generation validation to exercise the browser's persisted-source boundary.
for (const [title, source] of [
  [
    'HTML example',
    'flowchart TD\n A["<img src=https://example.test/probe onerror=window.__diagramAttacked++>"]',
  ],
  ['Script example', 'flowchart TD\n A["<script>window.__diagramAttacked++</script>"]'],
  ['Link example', 'flowchart TD\n A[Open]\n click A href "https://example.test/probe"'],
  [
    'Config example',
    '%%{init: {"securityLevel":"loose","htmlLabels":true}}%%\nflowchart TD\n A --> B',
  ],
  [
    'Style example',
    'flowchart TD\n A[Open]:::evil\n classDef evil fill:url(https://example.test/probe)',
  ],
])
  add(states.id, stateMessage, title, source);
const families = [
  ['Sequence', 'sequenceDiagram\n Alice->>Bob: Hello\n Bob-->>Alice: Hi'],
  ['Class', 'classDiagram\n Animal <|-- Duck\n Animal : +int age'],
  ['State', 'stateDiagram-v2\n [*] --> Learning\n Learning --> [*]'],
  ['Entity', 'erDiagram\n TEACHER ||--o{ LESSON : teaches'],
  ['Pie', 'pie\n "First round" : 4\n "Final" : 2'],
];
const familyIds = families.map(([title, source]) => add(states.id, stateMessage, title, source).id);
store.message(other.id, 'assistant', 'No diagram in this conversation.', 'completed');
store.close();

const run = promisify(execFile);
const session = `diagram-render-${process.pid}`;
const b = async (...args) =>
  (await run('agent-browser', ['--session', session, ...args], { maxBuffer: 4 * 1024 * 1024 }))
    .stdout;
const ev = async (expression) => JSON.parse(await b('eval', expression, '--json')).data.result;
const wait = (expression) => b('wait', '--fn', expression);
const click = (name) => b('find', 'role', 'button', 'click', '--name', name, '--exact');
async function openRoot(title) {
  await b('click', '.tree-switcher');
  await click(title); // A Library volume opens its tree in Read.
  await wait(
    `document.querySelector('.focused-chat h2')?.textContent===${JSON.stringify(title)} && getComputedStyle(document.querySelector('.focused-chat')).display!=='none'`,
  );
}
const calls = () => {
  try {
    return readFileSync(join(dir, 'calls.jsonl'), 'utf8').trim().split('\n').filter(Boolean).length;
  } catch {
    return 0;
  }
};
const card = (id) => `.diagram-card[data-artifact="${id}"]`;
const ready = (id) =>
  wait(
    `(()=>{const c=document.querySelector(${JSON.stringify(card(id))}),i=c?.querySelector('img');return c?.dataset.state==='ready' && i?.complete && i.naturalWidth>0})()`,
  );
const checks = [],
  processes = [];
const pass = (name, details = true) => {
  checks.push({ name, pass: true, details });
  console.log('PASS:', name);
};
let child,
  origin,
  port,
  stderr = '';
async function start() {
  child = fork(
    join(import.meta.dirname, 'diagram-rendering-server.mjs'),
    ['--serve', dir, String(port ?? 0)],
    {
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    },
  );
  child.stderr.on('data', (data) => {
    stderr += data;
  });
  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Fixture server startup timed out.')), 10000);
    child.once('message', (message) => {
      clearTimeout(timeout);
      resolve(message);
    });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Fixture server exited ${code}: ${stderr}`));
    });
  });
  origin = result.origin;
  port = new URL(origin).port;
  processes.push(result.pid);
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('Fixture server stop timed out.'));
    }, 10000);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
    child.send('stop');
  });
}
// Browser init script: counts injected-script attacks and CSP violations.
const init = join(dir, 'browser-init.js');
writeFileSync(
  init,
  "window.__diagramAttacked=0;window.__diagramViolations=[];addEventListener('securitypolicyviolation',e=>window.__diagramViolations.push(e.violatedDirective))",
);

export {
  dir,
  store,
  states,
  root,
  text,
  message,
  tall,
  wide,
  stepIds,
  families,
  familyIds,
  b,
  ev,
  wait,
  click,
  openRoot,
  calls,
  card,
  ready,
  checks,
  processes,
  pass,
  child,
  origin,
  stderr,
  start,
  stop,
  init,
};
