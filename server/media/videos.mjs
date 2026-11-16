import { randomUUID } from 'node:crypto';
import { renameSync, unlinkSync, readFileSync } from 'node:fs';
import {
  mkdir,
  writeFile,
  realpath,
  lstat,
  open,
  rm,
  copyFile,
  cp,
  access,
} from 'node:fs/promises';
import { join, basename } from 'node:path';
import { edgeNarration } from './narration.mjs';
import {
  videoPlan,
  libraryPieces,
  PLAN_INSTRUCTIONS,
  EXHIBITS_NOTE,
  CLIPS_NOTE,
  CUT_ATTEMPTS,
} from './video-plan.mjs';
import { fetchExhibit, fetchExhibits } from './exhibits.mjs';
import { detectClips } from './clips.mjs';
import { videoCall, writeCuts, cutError } from './video-cuts.mjs';
import { improvePiece } from './video-pieces.mjs';
import { sandboxProcess, REPO, withoutPaths } from './video-sandbox.mjs';
import { detectManim } from './manim.mjs';
import { sandboxManim, checkManim } from './manim-cut.mjs';

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

// Stills of a staged cut for its audit: server-chosen JPEG files inside the cut's private output.
export function sandboxSnapshot(workspace, stills, signal) {
  return sandboxProcess(
    workspace,
    [
      process.execPath,
      join(REPO, 'server/media/video-render.mjs'),
      workspace,
      '',
      join(REPO, 'node_modules'),
      JSON.stringify(stills),
    ],
    signal,
    () => {},
    120000 + stills.length * 15000,
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
// A cut plays live once its code and measured narration exist and its audit settled; Manim also needs its clip.
export const playable = (cut) =>
  !!(cut.code && cut.timing && cut.audited && (cut.engine !== 'manim' || cut.clip));

export async function generateVideo({
  provider,
  selection,
  // The chat model writes set pieces, cuts and repairs; the smart model plans and audits (ADR 0004).
  chat = { provider, selection },
  store,
  dir,
  artifact,
  previous,
  signal,
  timeout,
  render = sandboxRender,
  snapshot = sandboxSnapshot,
  narrate = edgeNarration,
  onPhase = () => {},
  manim = { detect: detectManim, render: sandboxManim, check: checkManim },
  onWarning = console.warn,
  // Texts to look vectors; null saves new pieces without an embedding.
  embed = null,
  onStage = () => {},
  // The SearXNG web search tool; when it is ready and switched on the planner may name exhibits (ADR 0005).
  search = null,
  exhibit = fetchExhibit,
  // Probes yt-dlp and ffmpeg; when they are not ready the planner gets no clip option.
  clips = detectClips,
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
  const caller = (base, choice) => (instructions, input, onText, images) =>
    wait(
      videoCall(base, choice, instructions, input, controller.signal, onText, images),
      Math.max(1, deadline - Date.now()),
      'Video composition timed out.',
    );
  const call = caller(provider, selection),
    write = caller(chat.provider, chat.selection);
  let published = false,
    count = 0;
  try {
    controller.signal.throwIfAborted();
    await mkdir(join(workspace, 'out'), { recursive: true, mode: 0o700 });
    await mkdir(join(workspace, 'tmp'), { recursive: true, mode: 0o700 });
    const prior = previous?.source ? JSON.parse(previous.source) : null;
    const kept = [];
    if (prior?.plan)
      for (const [i, cut] of prior.cuts.entries()) {
        const from = join(dir, 'video-work', artifact.id, previous.attempt, `cut-${i}`),
          to = join(workspace, `cut-${i}`);
        // Copy, never share, the old cut folder; timing counts only if its audio came along.
        const timing =
          cut.timing &&
          (await cp(from, to, { recursive: true })
            .then(() => access(join(to, 'public', 'narration.mp3')))
            .then(
              () => cut.timing,
              () => rm(to, { recursive: true, force: true }).then(() => null),
            ));
        kept.push({ ...cut, timing });
      }
    const searching =
      !prior?.plan &&
      !!search &&
      store.tutorTools().web_search !== false &&
      (await search.status({ signal: controller.signal })).ready;
    const clipping = searching && clips();
    const plan =
      prior?.plan ??
      videoPlan(
        await call(
          PLAN_INSTRUCTIONS +
            (searching ? EXHIBITS_NOTE : '') +
            (clipping?.ready ? CLIPS_NOTE : '') +
            (JSON.parse(artifact.input).differentVersion
              ? '\nCreate a different version: take a different approach than the previous version while explaining the same request.'
              : ''),
          artifact.input,
          (characters) => onPhase('planning', undefined, { characters }),
        ),
        { exhibits: searching, clips: !!clipping?.ready },
      );
    // Retry keeps the exhibits the first attempt fetched; their files came along with the cut folders.
    const exhibits = prior?.plan
      ? (prior.exhibits ?? [])
      : await fetchExhibits(plan, {
          fetch: (planned) =>
            exhibit(planned, { search, signal: controller.signal, clips: clipping }),
          workspace,
          signal: controller.signal,
          wait: (promise) =>
            wait(promise, Math.max(1, deadline - Date.now()), 'Video composition timed out.'),
          onWarning,
          // Each exhibit is credited as a resource of the video's learning tree, never a set piece.
          onExhibit: (e) =>
            store.addResource(artifact.conversation, {
              url: e.url,
              title: e.title,
              site: e.site,
              kind: e.kind,
            }),
        });
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
    let vectors = [];
    let writtenCuts = 0,
      narratedCuts = 0,
      playableStage = false,
      live,
      frames,
      rendered;
    // Live phase from real cut state: cuts 1 and 2 (every cut when there are two or fewer) decide when playback
    // can start, so the learner rarely waits at the first join; saving needs every cut playable.
    const report = (value = rendered) => {
      rendered = value;
      const ready = live.cuts.filter(playable).length;
      if (rendered !== undefined && ready === count) return onPhase('saving', rendered, frames);
      if (live.pieces === null) return onPhase('pieces');
      const waiting = live.cuts.slice(0, 2).find((c) => !playable(c));
      if (waiting)
        return !waiting.code
          ? onPhase('writing', undefined, {
              cut: live.cuts.filter((c) => c.code).length,
              cuts: count,
            })
          : !waiting.timing
            ? onPhase('narrating')
            : onPhase('auditing', undefined, {
                cut: live.cuts.filter((c) => c.audited).length,
                cuts: count,
              });
      if (!playableStage) onStage('playable', { cut: ready, cuts: count });
      playableStage = true;
      onPhase('playable', undefined, { cut: ready, cuts: count });
    };
    const work = await writeCuts({
      plan,
      workspace,
      kit: KIT,
      manimKit: MANIM_KIT,
      call,
      write,
      narrate,
      snapshot,
      check: manim.check && ((cutDir) => manim.check(cutDir, controller.signal, runtime)),
      clip: async (cutDir, durationInFrames) => {
        const clip = join(cutDir, 'out', randomUUID() + '.mp4');
        try {
          const result = await manim.render(cutDir, clip, controller.signal, () => {}, runtime);
          controller.signal.throwIfAborted();
          await validateOutput(cutDir, clip);
          if (result?.fps !== 30 || result.durationInFrames !== durationInFrames)
            throw new Error('Rendered Manim cut is unreadable.');
        } catch (error) {
          if (error.manimUnavailable) onWarning(`WARN video ${error.message}`);
          throw error;
        }
        await copyFile(clip, join(cutDir, 'public', 'manim.mp4'));
      },
      signal: controller.signal,
      wait,
      stop: (error) => controller.abort(error),
      kept,
      exhibits,
      pieces: prior?.pieces,
      // Each look's top library matches; the same call embeds pieces saved while no embedder was usable.
      matches: async (looks) => {
        if (!embed) return [];
        try {
          const pending = store.unembeddedPieces();
          const out = await embed([...looks, ...pending.map((p) => p.look)]);
          controller.signal.throwIfAborted();
          for (const [i, p] of pending.entries())
            if (out[looks.length + i]) store.embedPiece(p.id, out[looks.length + i]);
          vectors = out.slice(0, looks.length);
          return vectors.map((v) => (v ? store.nearestPieces(v) : []));
        } catch (error) {
          controller.signal.throwIfAborted();
          onWarning(`WARN video piece library unavailable: ${error.message}`);
          return [];
        }
      },
      // Accepted variant and new pieces join the piece library, reused ones record this video; the library never fails the video.
      // Returns each set piece's library id, so audits can flag a poor one.
      onPieces: async (source, names, choices) => {
        const ids = {};
        try {
          const reused = choices?.filter((c) => c.use === 'reuse') ?? [];
          const entries = libraryPieces(source, plan.styleBrief, names);
          for (const entry of entries)
            if (!reused.some((c) => c.name === entry.name))
              ids[entry.name] = store.savePiece(
                { ...entry, embedding: vectors[names.indexOf(entry.name)] ?? null },
                artifact.id,
              );
          for (const c of reused) {
            store.usePiece(c.piece.id, artifact.id);
            ids[c.name] = c.piece.id;
          }
        } catch (error) {
          controller.signal.throwIfAborted();
          onWarning(`WARN video piece library: ${error.message}`);
        }
        return ids;
      },
      // The smart model rewrites a flagged piece; only a rewrite that validates replaces the library entry.
      onPoorPiece: async (id, why) => {
        try {
          const piece = store.piece(id);
          if (piece) store.improvePiece(id, await improvePiece({ piece, why, call }));
        } catch (error) {
          controller.signal.throwIfAborted();
          onWarning(`WARN video piece improvement kept the saved piece: ${error.message}`);
        }
      },
      save: (data) => {
        const written = data.cuts.filter((c) => c.status === 'written').length;
        if (written > writtenCuts) onStage('cuts written', { cut: written, cuts: count });
        writtenCuts = Math.max(writtenCuts, written);
        const narrated = data.cuts.filter((c) => c.timing).length;
        if (narrated > narratedCuts) onStage('narration', { cut: narrated, cuts: count });
        narratedCuts = Math.max(narratedCuts, narrated);
        if (!store.videoData(artifact.conversation, artifact.id, artifact.attempt, data))
          throw new Error('Video job no longer owns this output.');
        live = data;
        report();
      },
    });
    const { cuts } = work.data;
    frames = { frames: cuts.reduce((n, c) => n + c.timing.durationInFrames, 0) };
    const outputs = [];
    for (let index = 0; index < cuts.length; index++) {
      const cut = cuts[index];
      for (;;) {
        controller.signal.throwIfAborted();
        cut.status = 'rendering';
        work.persist();
        const cutDir = await work.stage(index);
        const output = join(cutDir, 'out', randomUUID() + '.mp4');
        report(index / cuts.length);
        try {
          // A repair after a failed render leaves the Manim cut without a clip.
          if (cut.engine === 'manim' && !cut.clip) await work.clip(index);
          const result = await render(cutDir, output, controller.signal, (p) =>
            report((index + p) / cuts.length),
          );
          controller.signal.throwIfAborted();
          await validateOutput(cutDir, output);
          if (result?.fps !== 30 || result.durationInFrames !== cut.timing.durationInFrames)
            throw new Error('Rendered video is unreadable.');
          outputs.push(output);
          cut.status = 'ready';
          work.persist();
          report((index + 1) / cuts.length);
          break;
        } catch (error) {
          controller.signal.throwIfAborted();
          // Renderer diagnostics can name private directories; models and stored errors see them without paths.
          const reason = withoutPaths(error.diagnostic ?? error.message);
          if (error.manimUnavailable || work.attempts[index] >= CUT_ATTEMPTS) {
            cut.status = 'failed';
            work.persist();
            throw error.manimUnavailable || error.code
              ? error
              : cutError(reason, index, cuts.length);
          }
          cut.status = 'writing';
          await work.rewrite(index, reason);
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
    // Piece improvements run alongside rendering and never fail the video.
    await Promise.all(work.improving);
    onPhase('saving', 1, frames);
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
    // Keep private code and timing; discard bundles, temporary clips, and audio of canceled or stopped attempts.
    // A failed attempt keeps its audio so Retry can reuse the narration.
    await Promise.all(
      [workspace, ...Array.from({ length: count }, (_, i) => join(workspace, `cut-${i}`))].flatMap(
        (folder) =>
          [
            'bundle',
            'tmp',
            'out',
            ...(!published && signal.aborted ? ['public', 'narration.json'] : []),
            '.remotion',
          ].map((name) => rm(join(folder, name), { recursive: true, force: true })),
      ),
    );
  }
}
