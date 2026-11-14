import { randomUUID } from 'node:crypto';
import { accessSync, constants, existsSync, renameSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { generateDiagram } from '../../media/diagrams.mjs';
import { generateVisual } from '../../media/visuals.mjs';
import { generateVideo, mediaPath } from '../../media/videos.mjs';

export const STOPPED = new Error('TreeTutor stopped.');

// A crash before commit restores staged files; a crash after commit finishes removing them.
// The suffix records the owning artifact, including legacy workspaces named only by attempt.
export function recoverStaged(store, dir) {
  for (const folder of [join(dir, 'videos'), join(dir, 'video-work')]) {
    for (const name of existsSync(folder) ? readdirSync(folder) : []) {
      const match = /^(.*)\.deleting-([0-9a-f-]{36})$/.exec(name);
      if (!match) continue;
      const path = join(folder, name);
      if (store.hasArtifact(match[2])) renameSync(path, join(folder, match[1]));
      else rmSync(path, { recursive: true, force: true });
    }
  }
}

// Ready videos whose file is missing or unreadable are reported unavailable, so the learner can regenerate them.
export const readable = (path) => {
  try {
    accessSync(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
};

// Video jobs and visual and diagram runs; reads ctx.stopping when a job fails.
export function mediaJobs(ctx) {
  const { store, dir, videos, videoJobs, pick, selectionError, smart, metered } = ctx;
  // Frozen inputs stay server-side for every kind; explicit worker actions reuse them.
  const live = (artifact) => {
    const { input, attempt, ...a } = artifact;
    if (a.kind !== 'video') return a;
    if (a.status === 'pending' && a.conversation) {
      const job = videos.get(a.id);
      return {
        ...a,
        phase: job?.phase ?? 'planning',
        ...(job && { startedAt: job.startedAt, phaseStartedAt: job.phaseStartedAt }),
        ...(job?.progress !== undefined && { progress: job.progress }),
        ...(job?.characters !== undefined && { characters: job.characters }),
        ...(job?.frames !== undefined && { frames: job.frames }),
      };
    }
    return a.status === 'ready' && !readable(mediaPath(dir, a.id)) ? { ...a, available: false } : a;
  };
  // One job per attempt; it runs detached from any reply stream and only its own attempt can publish.
  const startVideo = (job) => {
    const running = {
      controller: new AbortController(),
      conversation: job.conversation,
      artifact: job.id,
      phase: 'planning',
      progress: undefined,
      startedAt: Date.now(),
      phaseStartedAt: Date.now(),
    };
    const input = JSON.parse(job.input),
      selection = input.selection ?? smart().resolved;
    videos.set(job.id, running);
    videoJobs.add(running);
    running.done = Promise.resolve()
      .then(async () => {
        const provider = pick(selection);
        selection.model ??=
          (await provider.model?.({ ...selection, thread: null })) ??
          (await provider.models()).find((m) => m.isDefault)?.model ??
          null;
        const invalid = await selectionError(selection);
        if (invalid)
          throw new Error(
            `${invalid.error} Check Smart in Settings → Models, then request a new video.`,
          );
        // Legacy jobs acquire a smart selection only on explicit Retry; newer jobs keep it across attempts.
        const frozen = JSON.stringify({ ...input, selection });
        const owned = store.videoInput(job.conversation, job.id, job.attempt, frozen);
        if (!owned || running.controller.signal.aborted) return;
        await generateVideo({
          provider: metered(provider, 'video', job.attempt, selection),
          selection,
          store,
          dir,
          artifact: { ...job, input: frozen },
          signal: running.controller.signal,
          timeout: ctx.videoTimeout,
          render: ctx.videoRender,
          narrate: ctx.videoNarrate,
          onPhase: (phase, progress, detail = {}) => {
            if (videos.get(job.id) !== running || running.controller.signal.aborted) return;
            if (running.phase !== phase) running.phaseStartedAt = Date.now();
            running.phase = phase;
            running.progress = Number.isFinite(progress)
              ? Math.min(1, Math.max(0, progress))
              : undefined;
            // Counts only: planning reports characters written, rendering the total frame count.
            running.characters = Number.isFinite(detail.characters) ? detail.characters : undefined;
            running.frames = Number.isFinite(detail.frames) ? detail.frames : undefined;
          },
        });
      })
      // A job stopped with the app stays pending, so the next start marks it interrupted.
      .catch((error) => {
        if (!ctx.stopping && running.controller.signal.reason !== STOPPED)
          store.finishVideo(job.conversation, job.id, job.attempt, {}, error.message);
      })
      .finally(() => {
        videoJobs.delete(running);
        if (videos.get(job.id) === running) videos.delete(job.id);
      });
  };
  const runVisual = async (artifact, signal) => {
    const input = JSON.parse(artifact.input),
      selection = { ...input.selection },
      provider = pick(selection);
    try {
      selection.model ??=
        (await provider.model?.({ ...selection, thread: null })) ??
        (await provider.models()).find((m) => m.isDefault)?.model ??
        null;
    } catch {
      throw new Error(
        'Could not choose the smart model. Check Smart in Settings → Models, then Retry.',
      );
    }
    if (signal.aborted) throw signal.reason;
    const invalid = await selectionError(selection);
    if (signal.aborted) throw signal.reason;
    if (invalid) throw new Error(`${invalid.error} Check Smart in Settings → Models, then Retry.`);
    if (
      !store.visualInput(
        artifact.conversation,
        artifact.id,
        JSON.stringify({ ...input, selection }),
      )
    )
      return;
    // Each automatic attempt is a separate usage event, in the existing diagram category.
    const metering = {
      generate: (...args) =>
        metered(provider, 'diagram', `${artifact.id}:${randomUUID()}`, selection).generate(...args),
    };
    return generateVisual(metering, selection, input, signal, ctx.visualTimeout);
  };
  // Explicit Retry runs detached like a video job, with the same stop/delete/polling lifecycle.
  const startDrawing = (artifact, parentSignal) => {
    const running = {
      controller: new AbortController(),
      conversation: artifact.conversation,
      artifact: artifact.id,
    };
    const cancel = () => running.controller.abort(parentSignal.reason);
    parentSignal?.addEventListener('abort', cancel, { once: true });
    videos.set(artifact.id, running);
    videoJobs.add(running);
    running.done = (async () => {
      const tree = store.tree(artifact.conversation),
        selection = { provider: tree.provider, model: tree.model };
      const source =
        artifact.kind === 'visual'
          ? await runVisual(artifact, running.controller.signal)
          : await generateDiagram(
              metered(pick(tree), 'diagram', `${artifact.id}:${randomUUID()}`, selection),
              selection,
              JSON.parse(artifact.input),
              running.controller.signal,
              ctx.diagramTimeout,
              ctx.diagramParse,
            );
      if (!running.controller.signal.aborted)
        store.finishArtifact(artifact.conversation, artifact.id, source);
    })()
      // Stopping leaves it pending, so startup recovery marks it failed; it never retries by itself.
      .catch((error) => {
        if (!ctx.stopping && running.controller.signal.reason !== STOPPED)
          store.finishArtifact(artifact.conversation, artifact.id, null, error.message);
      })
      .finally(() => {
        parentSignal?.removeEventListener('abort', cancel);
        videoJobs.delete(running);
        if (videos.get(artifact.id) === running) videos.delete(artifact.id);
      });
    return running;
  };
  return { live, startVideo, startDrawing };
}
