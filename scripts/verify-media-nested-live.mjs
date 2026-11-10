// Live native check (TreeTutor-sh8.8): a tutor-chosen Mermaid diagram and a requested video inside a nested child
// (root → child → grandchild) through the signed-in Claude CLI, then a Claude → Codex switch and an app/store reopen.
// Records every tutor and worker input at the provider boundary, plus actual Claude CLI stdin, and checks that no
// generation transcript (worker prompt, task, Mermaid source, composition) enters tutor history or branch snapshots.
// Synthetic data, isolated directory; credentials stay where they are. Usage: node scripts/verify-media-nested-live.mjs [out.json]
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import lockfile from 'proper-lockfile';
import { Store } from '../server/store.mjs';
import { Auth } from '../server/auth.mjs';
import { Claude } from '../server/claude.mjs';
import { Codex } from '../server/codex.mjs';
import { createApp } from '../server/app.mjs';
import { mediaPath } from '../server/videos.mjs';

process.umask(0o077);
const dir = mkdtempSync(join(tmpdir(), 'tt-media-nested-'));
const authDir = process.env.TREETUTOR_DATA_DIR ?? join(process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), 'treetutor');
const release = await lockfile.lock(authDir, { realpath: true, stale: 10000 });
const canary = 'PRIVATE-CANARY-' + Date.now();
const calls = [], stdin = [], checks = [];
const check = (name, pass, detail) => { checks.push({ name, pass: !!pass, ...(detail !== undefined && { detail }) }); console.error(`${pass ? 'ok' : 'FAIL'} - ${name}`); };
const launch = (command, args, options) => {
  const child = spawn(command, args, options);
  const end = child.stdin.end.bind(child.stdin);
  child.stdin.end = text => { stdin.push({ worker: /You (create one Mermaid|write one short Remotion)/.test(args[args.indexOf('--system-prompt') + 1]), text: text + '\n' + args[args.indexOf('--system-prompt') + 1] }); return end(text); };
  return child;
};
// Every generate() call: tutor turns and branch compaction get conversation data; media workers get a fresh-thread context with their own instructions.
const spy = (name, p) => { const g = p.generate.bind(p); p.generate = (ctx, text, emit, ...rest) => { const call = { provider: name, worker: /You (create one Mermaid|write one short Remotion)/.test(ctx.instructions ?? ''), thread: ctx.thread ?? null, context: JSON.stringify(ctx), text, output: '' }; calls.push(call); return g(ctx, text, e => { if (e.text) call.output += e.text; emit(e); }, ...rest); }; return p; };
const auth = new Auth(authDir);
const serve = async store => {
  const app = createApp({ store, auth, providers: { claude: spy('claude', new Claude(dir, launch)), codex: spy('codex', new Codex(auth, dir)) }, defaultProvider: 'claude', diagramTimeout: 120000, dir });
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const { csrf } = await (await fetch(origin + '/api/state')).json();
  const post = (path, body) => fetch(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf }, body: JSON.stringify(body) });
  const ask = async (id, text) => { const sse = await (await post(`/api/trees/${id}/messages`, { text })).text(); return { sse, done: sse.split('\n\n').filter(f => f.startsWith('data: ')).map(f => JSON.parse(f.slice(6))).find(e => e.type === 'done')?.status, error: sse.split('\n\n').filter(f => f.startsWith('data: ')).map(f => JSON.parse(f.slice(6))).find(e => e.type === 'error')?.error }; };
  return { app, origin, post, ask };
};
const branch = async (post, store, parent, question) => {
  const source = store.tree(parent).messages.findLast(m => m.role === 'assistant');
  const end = source.text.indexOf(' ', 40) > 0 ? source.text.indexOf(' ', 40) : source.text.length;
  const r = await post(`/api/trees/${parent}/branches`, { messageId: source.id, start: 0, end, text: source.text.slice(0, end), question });
  if (r.status !== 201) throw new Error('branch failed: ' + await r.text());
  return (await r.json()).id;
};
const path = join(dir, 'trees.sqlite');
let store = new Store(path);
const report = { date: new Date().toISOString(), data: dir, route: 'native Claude Code CLI sign-in (product default Claude model); existing app-owned ChatGPT consent for the Codex switch', checks };
try {
  const root = store.create('Media nested live', 'claude').id;
  store.message(root, 'user', `My private study note is ${canary}. How does a tournament tree find the minimum of eight numbers?`, 'completed');
  store.message(root, 'assistant', 'A tournament tree pairs the eight numbers into four matches, keeps the smaller value of each pair, and repeats with the winners: four matches, then two, then one. The final winner is the minimum after seven comparisons in total.', 'completed');
  let { app, post, ask } = await serve(store);
  const child = await branch(post, store, root, 'Why does each match keep only the smaller value?');
  const childTurn = await ask(child, 'In two sentences: why does each match keep only the smaller value?');
  check('nested: child reply completed (native Claude)', childTurn.done === 'completed', childTurn.error);
  const grand = await branch(post, store, child, 'How do the rounds narrow the field?');
  check('nested: grandchild branches from child', store.tree(grand).branch.parent === child);
  const snaps = () => JSON.stringify([store.tree(child).branch, store.tree(grand).branch]);
  const parents = () => JSON.stringify([store.tree(root).messages, store.tree(child).messages]);
  const snapBefore = snaps(), parentsBefore = parents();

  // Tutor-chosen diagram (the tutor decides; one rephrased retry if it answers in text only).
  for (const q of ['Explain how the rounds of this eight-player tournament narrow the field to one winner. A diagram of the rounds would really help here.', 'Please show the bracket of rounds as a diagram.']) {
    await ask(grand, q);
    if (store.tree(grand).artifacts.some(a => a.kind === 'mermaid')) break;
  }
  const diagram = store.tree(grand).artifacts.find(a => a.kind === 'mermaid');
  if (diagram?.status !== 'ready') report.failedDiagramWorkerOutputs = calls.filter(c => c.worker && /Mermaid/.test(c.context)).map(c => c.output);
  check('diagram: tutor-chosen Mermaid artifact ready in the grandchild under its reply', diagram?.status === 'ready' && store.tree(grand).messages.some(m => m.id === diagram.message && m.role === 'assistant'), diagram?.error ?? diagram?.status);
  check('diagram: branch snapshots and parent histories unchanged after generation', snaps() === snapBefore && parents() === parentsBefore);

  // Requested video.
  const videoTurn = await ask(grand, 'Please make a short video animating how the eight values are compared round by round.');
  let video = store.tree(grand).artifacts.find(a => a.kind === 'video');
  for (let i = 0; video?.status === 'pending' && i < 900; i++) { await new Promise(r => setTimeout(r, 1000)); video = store.tree(grand).artifacts.find(a => a.kind === 'video'); }
  check('video: requested video rendered and saved locally in the grandchild', video?.status === 'ready' && existsSync(mediaPath(dir, video.id)), video?.error ?? video?.status ?? videoTurn.error);
  check('video: branch snapshots and parent histories unchanged after generation', snaps() === snapBefore && parents() === parentsBefore);

  // Generation context = worker instructions, frozen task inputs and worker outputs (Mermaid source, composition).
  const workers = calls.filter(c => c.worker), tutors = () => calls.filter(c => !c.worker);
  const forbidden = workers.flatMap(w => [JSON.parse(w.context).instructions, w.text, w.output.trim()]).concat(diagram?.source ?? []).filter(s => s && s.length > 20);
  const leaks = list => list.filter(c => forbidden.some(f => (c.context + c.text).includes(f)) || /You (create one Mermaid|write one short Remotion)/.test(c.context + c.text)).length;
  check('workers: one diagram and one video worker, each a fresh thread with its own instructions', workers.length >= 2 && workers.every(w => w.thread === null), workers.map(w => w.provider));
  const tasks = workers.map(w => Object.keys(JSON.parse(w.text)).sort().join());
  check('workers: inputs are only the frozen task fields, no tutor transcript or canary', tasks.includes('description,excerpt,intent,title') && tasks.includes('excerpt,inheritedContext,intent,request,sources') && workers.every(w => !w.text.includes(canary) && !w.text.includes(store.tree(root).messages[1].text)), tasks);
  const follow = await ask(grand, 'In one sentence, what do the diagram and the video you made show?');
  const last = tutors().at(-1);
  check('Claude follow-up: tutor history carries artifact id/title metadata only', follow.done === 'completed' && last.thread === null && last.context.includes(diagram.id) && last.context.includes(video.id), follow.error);
  check('Claude: no tutor submission or Claude CLI stdin contains generation context', leaks(tutors()) === 0 && stdin.filter(s => !s.worker).every(s => !forbidden.some(f => s.text.includes(f))));

  // Provider switch Claude → Codex in the grandchild.
  const codexModel = (await (await fetch(`http://127.0.0.1:${app.server.address().port}/api/models`)).json()).models.find(m => m.provider === 'codex' && m.isDefault)?.model;
  const sw = await post(`/api/trees/${grand}/model`, { provider: 'codex', model: codexModel });
  const before = calls.length;
  const codexTurn = await ask(grand, 'Continuing: in one sentence, what does the final round decide?');
  const codexCall = calls.slice(before).find(c => c.provider === 'codex' && !c.worker);
  check('switch: Codex receives full saved history with artifact metadata and no generation context', sw.status === 200 && codexCall && codexCall.context.includes(diagram.id) && leaks([codexCall]) === 0);
  report.codexTurn = { model: codexModel, status: codexTurn.done, error: codexTurn.error ?? null };
  check('switch: native Codex reply completed', codexTurn.done === 'completed', codexTurn.error);
  check('switch: snapshots and parent histories unchanged', snaps() === snapBefore && parents() === parentsBefore);

  // App/store reopen: fresh Store, app and provider processes; no inference on reopen.
  const saved = JSON.stringify([root, child, grand].map(id => store.tree(id)));
  app.stop(); store.close();
  const count = calls.length;
  store = new Store(path);
  ({ app, post, ask } = await serve(store));
  check('reopen: trees, artifacts and snapshots identical; video file kept; no inference', JSON.stringify([root, child, grand].map(id => store.tree(id))) === saved && existsSync(mediaPath(dir, video.id)) && calls.length === count);
  if (store.tree(grand).provider !== 'claude') await post(`/api/trees/${grand}/model`, { provider: 'claude', model: store.tree(root).model });
  const after = await ask(grand, 'After the restart: in one sentence, what did the video show?');
  check('reopen: Claude follow-up completes without generation context in tutor history', after.done === 'completed' && leaks(tutors()) === 0 && stdin.filter(s => !s.worker).every(s => !forbidden.some(f => s.text.includes(f))), after.error);
  check('reopen: snapshots and parent histories unchanged', snaps() === snapBefore && parents() === parentsBefore);
  app.stop();
  report.artifacts = store.tree(grand).artifacts.map(({ id, kind, status, title, description, duration }) => ({ id, kind, status, title, description, duration }));
  report.calls = calls.map(({ provider, worker, thread }) => ({ provider, worker, resumed: !!thread }));
  report.models = [root, child, grand].map(id => store.tree(id).model);
} catch (error) {
  check('script completed', false, String(error));
} finally {
  store.close(); await release();
}
report.pass = checks.every(c => c.pass);
console.log(JSON.stringify(report, null, 2));
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(report, null, 2) + '\n');
process.exit(report.pass ? 0 : 1);
