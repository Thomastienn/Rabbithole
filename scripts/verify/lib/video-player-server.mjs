// Fixture server for verify-video-player.mjs, forked with --serve <dir>: synthetic tutor/worker providers,
// gated compose and render steps (released over IPC), real bubblewrap sandbox render.
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { Store } from '../../../server/store.mjs';
import { createApp } from '../../../server/app.mjs';
import { sandboxRender } from '../../../server/media/videos.mjs';
import { fakeNarration } from '../../../test/support/fake-narration.mjs';

export const task = {
  title: 'Peterson in the tournament tree',
  description: 'Two threads meet at each tree level.',
  intent: 'Animate two winners advancing.',
  excerpt: 'Peterson locks guard each node.',
};
const composition = `// Description: Two labelled boxes slide together into a final box over two seconds.
// Narration: "Winners advance."
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
export const durationInFrames = 90;
export default function Video() {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{ background: 'white', alignItems: 'center', justifyContent: 'center', fontSize: 40, opacity: interpolate(frame, [0, 30], [0, 1]) }}>A + B → Final</AbsoluteFill>;
}`;

if (process.argv[2] === '--serve') {
  const dir = process.argv[3],
    store = new Store(join(dir, 'trees.sqlite'));
  const gates = {};
  const gate = (name) =>
    new Promise((resolve) => {
      gates[name] = resolve;
    });
  const log = (kind) => appendFileSync(join(dir, 'calls.jsonl'), JSON.stringify({ kind }) + '\n');
  const done = (emit, text) => {
    emit({ type: 'item', item: 'answer', text });
    emit({ type: 'status', status: 'completed' });
  };
  const provider = {
    models: async () => [{ model: 'fixture-model', label: 'Fixture model', isDefault: true }],
    generate: async (tree, text, emit) => {
      if (tree.instructions?.includes('Remotion')) {
        log('worker');
        await gate('compose');
        return done(emit, composition);
      }
      log('tutor');
      done(
        emit,
        /video/i.test(text)
          ? 'Here is how Peterson fits.\n\n```treetutor-video\n' +
              JSON.stringify(task) +
              '\n```\n\nThen the winners advance.'
          : 'Continuing elsewhere.',
      );
    },
  };
  const videoRender = async (workspace, output, signal, onProgress) => {
    onProgress(0.4);
    await gate('render');
    return sandboxRender(workspace, output, signal, onProgress);
  };
  const app = createApp({
    store,
    provider,
    dir,
    videoRender,
    videoNarrate: fakeNarration,
    auth: { status: () => ({ connected: true }) },
  });
  process.on('message', (message) => {
    if (gates[message]) gates[message]();
    if (message === 'stop') {
      app.stop();
      store.close();
      process.exit(0);
    }
  });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  process.send({ origin: `http://127.0.0.1:${app.server.address().port}` });
}
