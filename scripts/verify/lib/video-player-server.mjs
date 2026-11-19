// Fixture server for verify-video-player.mjs, forked with --serve <dir>: synthetic tutor/worker providers,
// gated plan, cut 2 and first render steps (released over IPC), real bubblewrap sandbox render.
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { Store } from '../../../server/store.mjs';
import { createApp } from '../../../server/app.mjs';
import { sandboxRender } from '../../../server/media/videos.mjs';
import { fakeNarration } from '../../../test/support/fake-narration.mjs';
import { planText } from '../../../test/support/video-kit.mjs';

export const task = {
  title: 'Peterson in the tournament tree',
  description: 'Two threads meet at each tree level.',
  intent: 'Animate two winners advancing.',
  excerpt: 'Peterson locks guard each node.',
};
// Kit-valid cut code; the plan holds two cuts so cut 1 plays live while cut 2 is still being written.
const composition = `import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { type } from './kit';
export default function Video() {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: interpolate(frame, [0, 20], [0, 1]) }}><span style={type.title}>A + B → Final</span></AbsoluteFill>;
}`;
const plan = {
  title: task.title,
  description: 'Two labelled boxes slide together into a final box.',
  styleBrief: {
    layoutAreas: [{ name: 'stage', description: 'Winner above the final at the centre.' }],
    paletteRoles: { winner: 'amber' },
    recurringObjects: [{ name: 'Winner', position: 'centre', colorRole: 'winner' }],
    exactTerms: ['Winner', 'Final'],
  },
  cuts: [1, 2].map((i) => ({
    purpose: `Step ${i}`,
    engine: 'remotion',
    dimension: '2d',
    narration: 'Winners advance.',
    endState: `Winner at position ${i}`,
  })),
};

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
      if (tree.instructions?.startsWith('You plan')) {
        log('worker');
        await gate('compose');
        return done(emit, planText(plan));
      }
      if (tree.instructions?.startsWith('You write one Remotion cut')) {
        log('worker');
        if (JSON.parse(text).cut.purpose === 'Step 2') await gate('second');
        return done(emit, composition);
      }
      log('tutor');
      done(
        emit,
        /video/i.test(text)
          ? 'Here is how Peterson fits.\n\n```rabbithole-video\n' +
              JSON.stringify(task) +
              '\n```\n\nThen the winners advance.'
          : 'Continuing elsewhere.',
      );
    },
  };
  let held = false;
  const videoRender = async (workspace, output, signal, onProgress) => {
    onProgress(0.4);
    // Hold the first cut render only; the second cut and the join run straight through.
    if (!held) await gate('render');
    held = true;
    return sandboxRender(workspace, output, signal, onProgress);
  };
  const app = createApp({
    store,
    provider,
    dir,
    videoRender,
    // No stills from the fake renderer, so cut audits are skipped.
    videoSnapshot: async () => {},
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
