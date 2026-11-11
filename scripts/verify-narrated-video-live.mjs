// Narrated target-length 2D smoke: native selected provider, real isolated Remotion, HTTP and SQLite. Chat handoff is controlled.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir, homedir, cpus, totalmem } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Store } from '../server/store.mjs';
import { Claude } from '../server/claude.mjs';
import { Codex } from '../server/codex.mjs';
import { Auth } from '../server/auth.mjs';
import lockfile from 'proper-lockfile';
import { createApp } from '../server/app.mjs';
import { tutorContext } from '../server/diagrams.mjs';
import { mediaPath, sandboxRender } from '../server/videos.mjs';
import { edgeNarration } from '../server/narration.mjs';

process.umask(0o077);
const dir = mkdtempSync(join(tmpdir(), 'tt-narrated-video-live-')), path = join(dir, 'trees.sqlite');
const name = process.argv[2] ?? 'claude';
assert.ok(['claude', 'codex'].includes(name), 'choose claude or codex explicitly; no fallback');
let release;
if (name === 'codex') release = await lockfile.lock(process.env.TREETUTOR_DATA_DIR ?? join(process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), 'treetutor'), { realpath: true, stale: 10000 });
const smart = name === 'claude' ? new Claude(dir) : new Codex(new Auth(process.env.TREETUTOR_DATA_DIR ?? join(process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), 'treetutor')), dir);
const generate = smart.generate.bind(smart);
let calls = 0;
smart.generate = async (...args) => {
  calls++;
  try { return await generate(...args); }
  catch (error) { report.providerError = error.message; throw error; }
};
const task = { title: 'Why binary search halves the work', description: 'A sorted row narrows toward a hidden number.', intent: 'Create a creative 2D educational explanation of binary search for a beginner, about 90 seconds. Use about 210 spoken words. Contrast linear scanning with repeatedly halving a sorted search range; demonstrate searching for 23 in a small sorted list, explain why sorted order matters, and finish with logarithmic growth. Use accurate comparisons, large readable labels, a moving range bracket and meaningful timing aligned to the actual narration. No diagrams with tiny text.', excerpt: 'Binary search uses sorted order to discard half the remaining candidates after each comparison.' };
const tutor = { models: async () => [{ model: 'controlled-chat', isDefault: true }], generate: async (_tree, _text, emit) => {
  emit({ type: 'item', item: 'reply', text: 'Watch how binary search narrows the remaining candidates.\n```treetutor-video\n' + JSON.stringify(task) + '\n```' });
  emit({ type: 'status', status: 'completed' });
} };
const report = { checkedAt: new Date().toISOString(), evidence: 'Native subscription adapter for smart inference; controlled chat handoff; actual Edge TTS with timing metadata, actual sandboxed target-length 2D render; embedded subtitles. No 3D claim.',
  provider: name, effort: 'low', cpu: cpus()[0]?.model, memoryBytes: totalmem(), data: dir };
let store = new Store(path), app;
const serve = async () => {
  app = createApp({ store, videoNarrate: async (...args) => { const start = Date.now(); report.ttsCalls = (report.ttsCalls ?? 0) + 1; try { return await edgeNarration(...args); } finally { report.ttsMs = Date.now() - start; } }, providers: { openai: tutor, [name]: smart }, dir, videoRender: async (...args) => {
    const start = Date.now();
    try { return await sandboxRender(...args); } finally { report.renderMs = Date.now() - start; }
  }, auth: { status: () => ({ connected: true }) } });
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${app.server.address().port}`, { csrf } = await (await fetch(origin + '/api/state')).json();
  return { get: p => fetch(origin + p), post: (p, body) => fetch(origin + p, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf }, body: JSON.stringify(body) }) };
};
try {
  let { get, post } = await serve();
  const model = (await smart.models()).find(m => m.isDefault)?.model;
  report.model = model;
  assert.equal((await post('/api/settings/smart', { model: { provider: name, model }, followEffort: false, effort: 'low' })).status, 200);
  const tree = store.create('Smart video smoke', 'openai', 'controlled-chat'), started = Date.now();
  const stream = await (await post(`/api/trees/${tree.id}/messages`, { text: 'Make a narrated 90-second 2D video explaining binary search to a beginner with synchronized subtitles.' })).text();
  let video = store.tree(tree.id).artifacts[0];
  for (let i = 0; video?.status === 'pending' && i < 1800; i++) { await new Promise(r => setTimeout(r, 1000)); video = store.artifact(tree.id, video.id); }
  report.elapsedMs = Date.now() - started;
  assert.equal(video?.status, 'ready', video?.error ?? 'No ready video.');
  assert.equal(calls, 1, 'one native inference call; no repair or retry');
  const source = readFileSync(join(dir, 'video-work', video.id, video.attempt, 'Video.tsx'), 'utf8');
  assert.match(source, /Narration:/); assert.match(source, /plan/i);
  const visible = stream + await (await get(`/api/trees/${tree.id}`)).text() + JSON.stringify(tutorContext(store.tree(tree.id)));
  assert.ok(!visible.includes(source) && !visible.includes('video-work') && !visible.includes(video.attempt));
  assert.equal(report.ttsCalls, 1);
  assert.ok(video.duration >= 60 && video.duration <= 120, 'representative target length');
  const timing = JSON.parse(readFileSync(join(dir, 'video-work', video.id, video.attempt, 'public', 'timing.json')));
  report.timing = { sentences: timing.sentences.length, words: timing.words.length, captions: timing.captions.length, first: timing.captions[0], last: timing.captions.at(-1), durationInFrames: timing.durationInFrames };
  const file = mediaPath(dir, video.id);
  report.media = { id: video.id, duration: video.duration, bytes: statSync(file).size,
    probe: JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', file], { encoding: 'utf8' })).streams.map(s => ({ codec: s.codec_name, type: s.codec_type, width: s.width, height: s.height, duration: s.duration })) };
  mkdirSync('.impeccable/review', { recursive: true });
  for (const time of [1, 20, 45, 65]) execFileSync('ffmpeg', ['-v', 'error', '-ss', String(time), '-i', file, '-frames:v', '1', '-y', `.impeccable/review/narrated-video-${time}.png`]);
  report.usage = store.usageEvents().events.filter(e => e.task === 'video');
  await app.stop(); store.close(); store = new Store(path);
  ({ get } = await serve());
  assert.equal((await get(`/api/trees/${tree.id}/artifacts/${video.id}/media`)).status, 200);
  assert.equal(calls, 1, 'reopen serves local media without inference');
  assert.equal(report.ttsCalls, 1, 'restart performs no TTS');
  report.pass = true;
  console.log('PASS: native smart script/plan and custom 2D composition, real narrated MP4 with embedded subtitles, private production, restart reuse; one call.');
} catch (error) { report.pass = false; report.error = error.message; throw error; }
finally {
  await app?.stop(); store.close();
  await release?.();
  writeFileSync(`docs/verification/narrated-video-native-${name}.json`, JSON.stringify(report, null, 2) + '\n');
}
