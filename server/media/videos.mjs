import { randomUUID } from 'node:crypto';
import { renameSync, unlinkSync, readFileSync } from 'node:fs';
import { mkdir, writeFile, realpath, lstat, open, rm, copyFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { edgeNarration } from './narration.mjs';
import { videoPlan, PLAN_INSTRUCTIONS, CUT_ATTEMPTS } from './video-plan.mjs';
import { videoCall, writeCuts } from './video-cuts.mjs';
import { sandboxProcess, REPO } from './video-sandbox.mjs';
import { detectManim } from './manim.mjs';
import { sandboxManim } from './manim-cut.mjs';

const MAX_MEDIA = 200 * 1024 * 1024;
const KIT = readFileSync(new URL('./video-kit.tsx', import.meta.url), 'utf8');
const MANIM_KIT = readFileSync(new URL('./manim-kit.py', import.meta.url), 'utf8');
// The learner must name a video; the tutor's block alone never starts one.
export const asksForVideo = (text) =>
  !/\b(?:don['’]t|do not|never)\s+(?:\w+\s+){0,3}(?:make|create|generate|render|produce|show|give|animate)\b/i.test(
    text,
  ) &&
  /\b(?:make|create|generate|render|produce|show|give|want|need)\b[^.!?\n]{0,120}\b(?:video|animation|clip|movie)\b|\banimate\b|\b(?:video|animation|clip|movie)\s*,?\s+please\b/i.test(
    text,
  );

export { SANDBOX } from './video-sandbox.mjs';

export function sandboxRender(workspace, output, signal, onProgress = () => {}, timeout) {
  const budget =
    timeout ??
    120000 +
      (JSON.parse(readFileSync(join(workspace, 'narration.json'), 'utf8')).durationInFrames / 30) *
        15000;
  return sandboxProcess(
    workspace,
    [
      process.execPath,
      join(REPO, 'server/media/video-render.mjs'),
      workspace,
      output,
      join(REPO, 'node_modules'),
    ],
    signal,
    onProgress,
    budget,
  );
}

// Accept only the server-chosen file inside this attempt's private output, as a regular readable MP4.
export async function validateOutput(workspace, output) {
  const expected = join(await realpath(workspace), 'out', basename(output));
  const stat = await lstat(output).catch(() => null);
  if (!stat?.isFile() || (await realpath(output).catch(() => null)) !== expected)
    throw new Error('Rendered video is outside its workspace.');
  if (stat.size < 1024 || stat.size > MAX_MEDIA) throw new Error('Rendered video is unreadable.');
  const file = await open(output, 'r');
  try {
    const head = Buffer.alloc(12);
    await file.read(head, 0, 12, 0);
    if (head.toString('latin1', 4, 8) !== 'ftyp') throw new Error('Rendered video is unreadable.');
  } finally {
    await file.close();
  }
}

export const mediaPath = (dir, id) => join(dir, 'videos', `${id}.mp4`);

export async function generateVideo({
  provider,
  selection,
  store,
  dir,
  artifact,
  signal,
  timeout,
  render = sandboxRender,
  narrate = edgeNarration,
  onPhase = () => {},
  manim = { detect: detectManim, render: sandboxManim },
  onWarning = console.warn,
  onStage = () => {},
}) {
  const workspace = join(dir, 'video-work', artifact.id, artifact.attempt);
  const controller = new AbortController();
  const cancel = () => controller.abort(signal.reason);
  signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) cancel();
  let rejectAbort;
  const aborted = new Promise((_, reject) => {
    rejectAbort = () => reject(controller.signal.reason);
    controller.signal.addEventListener('abort', rejectAbort, { once: true });
    if (controller.signal.aborted) rejectAbort();
  });
  aborted.catch(() => {});
  const wait = async (promise, budget, message) => {
    const timer = setTimeout(() => controller.abort(new Error(message)), budget);
    try {
      return await Promise.race([promise, aborted]);
    } finally {
      clearTimeout(timer);
    }
  };
  const deadline = Date.now() + (timeout ?? 600000);
  const call = (instructions, input) =>
    wait(
      videoCall(provider, selection, instructions, input, controller.signal, (characters) =>
        onPhase('planning', undefined, { characters }),
      ),
      Math.max(1, deadline - Date.now()),
      'Video composition timed out.',
    );
  let published = false,
    count = 0;
  try {
    controller.signal.throwIfAborted();
    await mkdir(join(workspace, 'out'), { recursive: true, mode: 0o700 });
    await mkdir(join(workspace, 'tmp'), { recursive: true, mode: 0o700 });
    const plan = videoPlan(
      await call(
        PLAN_INSTRUCTIONS +
          (JSON.parse(artifact.input).differentVersion
            ? '\nCreate a different version: take a different approach than the previous version while explaining the same request.'
            : ''),
        artifact.input,
      ),
    );
    let runtime;
    if (plan.cuts.some((c) => c.engine === 'manim')) {
      runtime = manim.detect();
      if (!runtime.ready) {
        onWarning(`WARN video ${runtime.error}`);
        throw new Error(runtime.error);
      }
    }
    count = plan.cuts.length;
    onStage('cuts', { cuts: count });
    onPhase('narrating');
    let writtenCuts = 0;
    const work = await writeCuts({
      plan,
      workspace,
      kit: KIT,
      manimKit: MANIM_KIT,
      call,
      narrate,
      signal: controller.signal,
      wait,
      stop: (error) => controller.abort(error),
      save: (data) => {
        const written = data.cuts.filter((c) => c.status === 'written').length;
        if (written > writtenCuts) onStage('cuts written', { cut: written, cuts: count });
        writtenCuts = Math.max(writtenCuts, written);
        if (!store.videoData(artifact.conversation, artifact.id, artifact.attempt, data))
          throw new Error('Video job no longer owns this output.');
      },
    });
    const { cuts } = work.data;
    const frames = { frames: cuts.reduce((n, c) => n + c.timing.durationInFrames, 0) };
    const outputs = [];
    for (let index = 0; index < cuts.length; index++) {
      const cut = cuts[index];
      for (;;) {
        controller.signal.throwIfAborted();
        cut.status = 'rendering';
        work.persist();
        const cutDir = await work.stage(index);
        const output = join(cutDir, 'out', randomUUID() + '.mp4');
        onPhase('rendering', index / cuts.length, frames);
        try {
          if (cut.engine === 'manim') {
            const clip = join(cutDir, 'out', randomUUID() + '.mp4');
            const result = await manim.render(cutDir, clip, controller.signal, () => {}, runtime);
            controller.signal.throwIfAborted();
            await validateOutput(cutDir, clip);
            if (result?.fps !== 30 || result.durationInFrames !== cut.timing.durationInFrames)
              throw new Error('Rendered Manim cut is unreadable.');
            await copyFile(clip, join(cutDir, 'public', 'manim.mp4'));
            cut.clip = `cut-${index}/public/manim.mp4`;
          }
          const result = await render(cutDir, output, controller.signal, (p) =>
            onPhase('rendering', (index + p) / cuts.length, frames),
          );
          controller.signal.throwIfAborted();
          await validateOutput(cutDir, output);
          if (result?.fps !== 30 || result.durationInFrames !== cut.timing.durationInFrames)
            throw new Error('Rendered video is unreadable.');
          outputs.push(output);
          cut.status = 'ready';
          work.persist();
          if (index === 0) onStage('playable', { cut: 1, cuts: count });
          onPhase('rendering', (index + 1) / cuts.length, frames);
          break;
        } catch (error) {
          controller.signal.throwIfAborted();
          if (error.manimUnavailable) onWarning(`WARN video ${error.message}`);
          if (error.manimUnavailable || work.attempts[index] >= CUT_ATTEMPTS) {
            cut.status = 'failed';
            work.persist();
            throw error;
          }
          cut.status = 'writing';
          // Renderer diagnostics can contain private paths or generated text. Send only a fixed repair hint.
          await work.rewrite(
            index,
            cut.engine === 'manim'
              ? 'The previous Manim cut failed validation or rendering. Rewrite a simpler valid Cut(HouseScene) using only named kit imports, brief colors/fonts and measured narration time.'
              : 'The previous cut failed rendering. Rewrite a simpler valid component.',
          );
        }
      }
    }
    let output = outputs[0];
    if (cuts.length > 1) {
      await writeFile(
        join(workspace, 'narration.json'),
        JSON.stringify({ fps: 30, durationInFrames: frames.frames }),
      );
      await writeFile(
        join(workspace, 'cuts.json'),
        JSON.stringify(
          outputs.map((file, i) => ({ file, durationInFrames: cuts[i].timing.durationInFrames })),
        ),
      );
      output = join(workspace, 'out', randomUUID() + '.mp4');
      const result = await render(workspace, output, controller.signal, () => {});
      await validateOutput(workspace, output);
      if (result?.fps !== 30 || result.durationInFrames !== frames.frames)
        throw new Error('Rendered video is unreadable.');
    }
    onPhase('saving');
    const final = mediaPath(dir, artifact.id);
    await mkdir(join(dir, 'videos'), { recursive: true, mode: 0o700 });
    const owner = store.artifact(artifact.conversation, artifact.id);
    if (
      owner?.attempt !== artifact.attempt ||
      owner.status !== 'pending' ||
      controller.signal.aborted
    )
      throw new Error('Video job no longer owns this output.');
    // Publish filesystem metadata and the row in one turn so Cancel/Retry cannot interleave.
    try {
      renameSync(output, final);
      const ready = store.finishVideo(artifact.conversation, artifact.id, artifact.attempt, {
        title: plan.title,
        description: plan.description,
        duration: frames.frames / 30,
      });
      if (ready?.status !== 'ready') throw new Error();
      published = true;
      onStage('saved');
      return ready;
    } catch {
      try {
        unlinkSync(final);
      } catch {}
      throw new Error('Video could not be saved.');
    }
  } catch (error) {
    controller.abort(error);
    throw error.code ? new Error('Video could not be generated.') : error;
  } finally {
    signal.removeEventListener('abort', cancel);
    controller.signal.removeEventListener('abort', rejectAbort);
    // Keep private code and timing; discard bundles, temporary clips and unpublished audio.
    await Promise.all(
      [workspace, ...Array.from({ length: count }, (_, i) => join(workspace, `cut-${i}`))].flatMap(
        (folder) =>
          [
            'bundle',
            'tmp',
            'out',
            ...(!published ? ['public', 'narration.json'] : []),
            '.remotion',
          ].map((name) => rm(join(folder, name), { recursive: true, force: true })),
      ),
    );
  }
}
