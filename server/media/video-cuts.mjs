import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CUT_ENTRY, CUT_INSTRUCTIONS } from './video-cut.mjs';
import { cutSource, CUT_ATTEMPTS, CUT_PAUSE_FRAMES, MAX_SOURCE } from './video-plan.mjs';
import { stageNarration } from './narration.mjs';

export async function videoCall(provider, selection, instructions, input, signal, onText) {
  const items = new Map();
  let status, overflow;
  try {
    await provider.generate(
      { ...selection, thread: null, instructions },
      input,
      (event) => {
        if (signal.aborted) return;
        if ((event.type === 'delta' || event.type === 'item') && !overflow) {
          items.set(
            event.item,
            event.type === 'item' ? event.text : (items.get(event.item) ?? '') + event.text,
          );
          const bytes = [...items.values()].reduce((n, v) => n + Buffer.byteLength(v), 0);
          if (items.size > 32 || bytes > MAX_SOURCE) {
            overflow = true;
            items.clear();
          } else onText?.(bytes);
        }
        if (event.type === 'status') status = event.status;
      },
      () => {},
      signal,
    );
  } catch {
    signal.throwIfAborted();
    throw new Error('Video provider failed to generate a composition.');
  }
  signal.throwIfAborted();
  if (status !== 'completed') throw new Error('Video composition did not complete.');
  if (overflow)
    throw Object.assign(new Error('Video composition exceeds 64 KiB.'), { invalidOutput: true });
  return [...items.values()].join('\n\n');
}

export async function writeCuts({ plan, workspace, kit, call, narrate, signal, save, wait, stop }) {
  const cuts = plan.cuts.map((c) => ({
    engine: c.engine,
    status: 'pending',
    code: null,
    timing: null,
  }));
  const data = { plan, cuts };
  const persist = () => {
    signal.throwIfAborted();
    save(data);
  };
  persist();
  // Narration depends only on the plan, never on a cut writer or a neighbouring cut finishing.
  const attempts = cuts.map(() => 0);
  const rewrite = async (index, reason) => {
    let error = reason && new Error(reason);
    while (attempts[index] < CUT_ATTEMPTS) {
      attempts[index]++;
      // Provider/auth failures are final; only validation/render failures spend a repair attempt.
      let raw;
      try {
        raw = await call(
          CUT_INSTRUCTIONS,
          JSON.stringify({
            styleBrief: plan.styleBrief,
            cut: plan.cuts[index],
            previousEndState: index ? plan.cuts[index - 1].endState : null,
            ...(error && { validationError: error.message }),
          }),
        );
      } catch (e) {
        if (!e.invalidOutput) throw e;
        error = e;
        continue;
      }
      try {
        cuts[index].code = cutSource(raw, plan.styleBrief);
      } catch (e) {
        error = e;
        continue;
      }
      persist();
      return;
    }
    throw error;
  };
  const writing = cuts.map(async (cut, index) => {
    const dir = join(workspace, `cut-${index}`);
    cut.status = 'writing';
    persist();
    const operations = [
      rewrite(index),
      (async () => {
        const narration = await wait(
          narrate(plan.cuts[index].narration, signal),
          120000 + plan.cuts[index].narration.length * 30,
          'Video narration timed out.',
        );
        await mkdir(join(dir, 'out'), { recursive: true, mode: 0o700 });
        await mkdir(join(dir, 'tmp'), { mode: 0o700 });
        const timing = await stageNarration(dir, narration, signal);
        cut.timing = {
          ...timing,
          audioFrames: timing.durationInFrames,
          durationInFrames: timing.durationInFrames + CUT_PAUSE_FRAMES,
          transitionIn: index > 0,
        };
        await writeFile(join(dir, 'narration.json'), JSON.stringify(cut.timing));
        const publicTiming = JSON.parse(await readFile(join(dir, 'public', 'timing.json')));
        await writeFile(
          join(dir, 'public', 'timing.json'),
          JSON.stringify({ ...publicTiming, ...cut.timing }),
        );
        persist();
      })(),
    ];
    try {
      await Promise.all(operations);
    } catch (error) {
      if (!signal.aborted) {
        cut.status = 'failed';
        persist();
      }
      stop(error);
      // A failed writer may race with audio staging. Drain both before removing private files.
      await Promise.allSettled(operations);
      throw error;
    }
    cut.status = 'written';
    persist();
  });
  try {
    await Promise.all(writing);
  } catch (error) {
    stop(error);
    await Promise.allSettled(writing);
    throw error;
  }
  const stage = async (index) => {
    const dir = join(workspace, `cut-${index}`);
    await writeFile(join(dir, 'Video.tsx'), cuts[index].code);
    await writeFile(join(dir, 'index.tsx'), CUT_ENTRY);
    await writeFile(
      join(dir, 'kit.tsx'),
      kit +
        '\nexport const colors = {\n' +
        Object.entries(plan.styleBrief.paletteRoles)
          .map(([role, ink]) => `  ${JSON.stringify(role)}: palette.${ink},`)
          .join('\n') +
        '\n};\n',
    );
    return dir;
  };
  return { data, attempts, rewrite, stage, persist };
}
