// Bounded 2D smart-worker smoke: native selected provider, real isolated Remotion, HTTP and SQLite. Chat handoff is controlled.
import { verifyOut } from './lib/output.mjs';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir, homedir, cpus, totalmem } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Store } from '../../server/store.mjs';
import { Claude } from '../../server/providers/claude.mjs';
import { Codex } from '../../server/providers/codex.mjs';
import { Auth } from '../../server/providers/auth.mjs';
import lockfile from 'proper-lockfile';
import { createApp } from '../../server/app.mjs';
import { tutorContext } from '../../server/media/diagrams.mjs';
import { mediaPath, sandboxRender } from '../../server/media/videos.mjs';

process.umask(0o077);
const dir = mkdtempSync(join(tmpdir(), 'tt-smart-video-live-')),
  path = join(dir, 'trees.sqlite');
const name = process.argv[2] ?? 'claude';
assert.ok(['claude', 'codex'].includes(name), 'choose claude or codex explicitly; no fallback');
let release;
if (name === 'codex')
  release = await lockfile.lock(
    process.env.TREETUTOR_DATA_DIR ??
      join(process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), 'treetutor'),
    { realpath: true, stale: 10000 },
  );
const smart =
  name === 'claude'
    ? new Claude(dir)
    : new Codex(
        new Auth(
          process.env.TREETUTOR_DATA_DIR ??
            join(process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), 'treetutor'),
        ),
        dir,
      );
const generate = smart.generate.bind(smart);
let calls = 0;
smart.generate = async (...args) => {
  calls++;
  try {
    return await generate(...args);
  } catch (error) {
    report.providerError = error.message;
    throw error;
  }
};
const task = {
  title: 'Motion over time',
  description: 'A ball moves from left to right.',
  intent:
    'Create a three-second 2D demonstration of a ball moving left to right. Explain its motion with a short private script and visual plan, then implement a custom composition.',
  excerpt: 'Position changes with time.',
};
const tutor = {
  models: async () => [{ model: 'controlled-chat', isDefault: true }],
  generate: async (_tree, _text, emit) => {
    emit({
      type: 'item',
      item: 'reply',
      text:
        'Watch how position changes with time.\n```treetutor-video\n' +
        JSON.stringify(task) +
        '\n```',
    });
    emit({ type: 'status', status: 'completed' });
  },
};
const report = {
  checkedAt: new Date().toISOString(),
  evidence:
    'Native subscription adapter for smart inference; controlled chat handoff; actual sandboxed short 2D render. No narration, subtitle, long-duration or 3D claim.',
  provider: name,
  effort: 'low',
  cpu: cpus()[0]?.model,
  memoryBytes: totalmem(),
  data: dir,
};
let store = new Store(path),
  app;
const serve = async () => {
  app = createApp({
    store,
    providers: { openai: tutor, [name]: smart },
    dir,
    videoRender: async (...args) => {
      const start = Date.now();
      try {
        return await sandboxRender(...args);
      } finally {
        report.renderMs = Date.now() - start;
      }
    },
    auth: { status: () => ({ connected: true }) },
  });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${app.server.address().port}`,
    { csrf } = await (await fetch(origin + '/api/state')).json();
  return {
    get: (p) => fetch(origin + p),
    post: (p, body) =>
      fetch(origin + p, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf },
        body: JSON.stringify(body),
      }),
  };
};
try {
  let { get, post } = await serve();
  const model = (await smart.models()).find((m) => m.isDefault)?.model;
  report.model = model;
  assert.equal(
    (
      await post('/api/settings/smart', {
        model: { provider: name, model },
        followEffort: false,
        effort: 'low',
      })
    ).status,
    200,
  );
  const tree = store.create('Smart video smoke', 'openai', 'controlled-chat'),
    started = Date.now();
  const stream = await (
    await post(`/api/trees/${tree.id}/messages`, {
      text: 'Make a three-second video showing a ball moving from left to right.',
    })
  ).text();
  let video = store.tree(tree.id).artifacts[0];
  for (let i = 0; video?.status === 'pending' && i < 330; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    video = store.artifact(tree.id, video.id);
  }
  report.elapsedMs = Date.now() - started;
  assert.equal(video?.status, 'ready', video?.error ?? 'No ready video.');
  const data = JSON.parse(video.source);
  assert.ok(data.plan.cuts.length > 0 && data.cuts.every((c) => c.status === 'ready'));
  assert.ok(
    calls >= 1 + data.cuts.length && calls <= 1 + data.cuts.length * 2,
    'one plan and bounded cut-writing/repair calls',
  );
  const completedCalls = calls;
  report.calls = calls;
  report.cuts = data.cuts.length;
  report.repairs = calls - 1 - data.cuts.length;
  const source = data.cuts.map((c) => c.code).join('\n');
  const visible =
    stream +
    (await (await get(`/api/trees/${tree.id}`)).text()) +
    JSON.stringify(tutorContext(store.tree(tree.id)));
  assert.ok(
    !visible.includes(source) &&
      !visible.includes('video-work') &&
      !visible.includes(video.attempt),
  );
  const file = mediaPath(dir, video.id);
  report.media = {
    id: video.id,
    duration: video.duration,
    bytes: statSync(file).size,
    probe: JSON.parse(
      execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', file], {
        encoding: 'utf8',
      }),
    ).streams.map((s) => ({
      codec: s.codec_name,
      type: s.codec_type,
      width: s.width,
      height: s.height,
      duration: s.duration,
    })),
  };
  mkdirSync('.impeccable/review', { recursive: true });
  execFileSync('ffmpeg', [
    '-v',
    'error',
    '-ss',
    '1',
    '-i',
    file,
    '-frames:v',
    '1',
    '-y',
    '.impeccable/review/smart-video-native-frame.png',
  ]);
  report.usage = store.usageEvents().events.filter((e) => e.task === 'video');
  await app.stop();
  store.close();
  store = new Store(path);
  ({ get } = await serve());
  assert.equal((await get(`/api/trees/${tree.id}/artifacts/${video.id}/media`)).status, 200);
  assert.equal(calls, completedCalls, 'reopen serves local media without inference');
  report.pass = true;
  console.log(
    'PASS: native smart script/plan and custom 2D composition, real MP4, private production, restart reuse; planned cuts.',
  );
} catch (error) {
  report.pass = false;
  report.error = error.message;
  throw error;
} finally {
  await app?.stop();
  store.close();
  await release?.();
  writeFileSync(
    `${verifyOut}/smart-video-native-${name}.json`,
    JSON.stringify(report, null, 2) + '\n',
  );
}
