import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, realpath, lstat, open, rm, copyFile, cp, access } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { edgeNarration } from './narration.mjs';
import {
  videoPlan,
  libraryPieces,
  PLAN_INSTRUCTIONS,
  EXHIBITS_NOTE,
  CLIPS_NOTE,
} from './video-plan.mjs';
import { fetchExhibit, videoMedia } from './exhibits.mjs';
import { detectClips } from './clips.mjs';
import { writeCuts, playable, cutRows } from './video-cuts.mjs';
import { videoCall } from './video-call.mjs';

export { playable };
import { improvePiece } from './video-pieces.mjs';
import { sandboxProcess, REPO } from './video-sandbox.mjs';
import { detectManim } from './manim.mjs';
import { sandboxManim, checkManim } from './manim-cut.mjs';

const MAX_MEDIA = 200 * 1024 * 1024;
export const KIT = readFileSync(new URL('./video-kit.tsx', import.meta.url), 'utf8');
export const MANIM_KIT = readFileSync(new URL('./manim-kit.py', import.meta.url), 'utf8');
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
  snapshot = sandboxSnapshot,
  narrate = edgeNarration,
  // Renders stills of saved or improved library pieces in the background.
  stills = () => {},
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
  // Whether the chat model reads images; only then does the set piece writer see reference photos.
  readsImages = false,
  // Whether the smart model calls tools natively, and the MCP server for its audit calls.
  capable = false,
  mcp,
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
  const caller = (base, choice) => (instructions, input, onText, images, cut, tools) =>
    wait(
      videoCall(base, choice, instructions, input, controller.signal, onText, images, cut, tools),
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
    const { exhibits, references } = await videoMedia({
      plan,
      prior,
      from: prior?.plan && join(dir, 'video-work', artifact.id, previous.attempt),
      searching,
      fetch: (planned) => exhibit(planned, { search, signal: controller.signal, clips: clipping }),
      workspace,
      signal: controller.signal,
      wait: (promise) =>
        wait(promise, Math.max(1, deadline - Date.now()), 'Video composition timed out.'),
      onWarning,
      credit: (resource) => store.addResource(artifact.conversation, resource),
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
    // Each looked-up look's vector, for saving the named pieces and parts that draw it.
    const vectors = new Map();
    let writtenCuts = 0,
      narratedCuts = 0,
      playableStage = false,
      live,
      drawing;
    // Live phase from real cut state: cuts 1 and 2 (every cut when there are two or fewer) decide when playback
    // can start, so the learner rarely waits at the first join; saving needs every cut playable.
    const report = () => {
      // Per-cut rows and set piece drawing ride along with every phase report.
      const say = (phase, progress, detail) =>
        onPhase(phase, progress, {
          ...detail,
          cutRows: cutRows(live.cuts, plan),
          ...(live.pieces === null && drawing && { drawing }),
        });
      const ready = live.cuts.filter(playable).length;
      if (live.pieces === null) return say('pieces');
      const waiting = live.cuts.slice(0, 2).find((c) => !playable(c));
      if (waiting)
        return !waiting.code
          ? say('writing', undefined, {
              cut: live.cuts.filter((c) => c.code).length,
              cuts: count,
            })
          : !waiting.timing
            ? say('narrating')
            : say('auditing', undefined, {
                cut: live.cuts.filter((c) => c.audited).length,
                cuts: count,
              });
      if (!playableStage) onStage('playable', { cut: ready, cuts: count });
      playableStage = true;
      say('playable', undefined, { cut: ready, cuts: count });
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
      references,
      readsImages,
      capable,
      mcp,
      pieces: prior?.pieces,
      onDrawing: (value) => {
        drawing = value;
        if (live) report();
      },
      // Each look's top library matches; the same call embeds pieces saved while no embedder was usable.
      matches: async (looks) => {
        if (!embed) return [];
        try {
          const pending = store.unembeddedPieces();
          const out = await embed([...looks, ...pending.map((p) => p.look)]);
          controller.signal.throwIfAborted();
          for (const [i, p] of pending.entries())
            if (out[looks.length + i]) store.embedPiece(p.id, out[looks.length + i]);
          looks.forEach((look, i) => out[i] && vectors.set(look, out[i]));
          return looks.map((_, i) => (out[i] ? store.nearestPieces(out[i]) : []));
        } catch (error) {
          controller.signal.throwIfAborted();
          onWarning(`WARN video piece library unavailable: ${error.message}`);
          return [];
        }
      },
      // Accepted variant and new pieces join the piece library, reused ones record this video; the library never fails the video.
      // Returns each set piece's library id, so audits can flag a poor one.
      // Parts are saved before the pieces built from them, which record their ids instead of copies.
      onPieces: async (source, names, choices, parts = []) => {
        const ids = {};
        try {
          for (const c of choices?.filter((c) => c.use === 'reuse') ?? []) {
            store.usePiece(c.piece.id, artifact.id);
            ids[c.name] = c.piece.id;
          }
          const entries = libraryPieces(source, plan.styleBrief, names, parts);
          const save = (entry) =>
            (ids[entry.name] ??= store.savePiece(
              {
                ...entry,
                parts: entry.parts.map((name) => ({
                  name,
                  id: save(entries.find((e) => e.name === name)),
                })),
                embedding: vectors.get(entry.look) ?? null,
              },
              artifact.id,
            ));
          entries.forEach(save);
          stills();
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
          if (piece) {
            store.improvePiece(id, await improvePiece({ piece, why, call }));
            stills();
          }
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
    const frames = { frames: cuts.reduce((n, c) => n + c.timing.durationInFrames, 0) };
    // Piece improvements run alongside the last audits and never fail the video.
    await Promise.all(work.improving);
    onPhase('saving');
    const owner = store.artifact(artifact.conversation, artifact.id);
    if (
      owner?.attempt !== artifact.attempt ||
      owner.status !== 'pending' ||
      controller.signal.aborted
    )
      throw new Error('Video job no longer owns this output.');
    // The saved video is its playable cuts; an MP4 is rendered only when the learner exports it.
    let ready;
    try {
      ready = store.finishVideo(artifact.conversation, artifact.id, artifact.attempt, {
        title: plan.title,
        description: plan.description,
        duration: frames.frames / 30,
      });
    } catch {}
    if (ready?.status !== 'ready') throw new Error('Video could not be saved.');
    published = true;
    onStage('saved');
    return ready;
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
