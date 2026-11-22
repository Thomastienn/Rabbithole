import { discussionArtifact } from '../../media/discussions.mjs';
import { randomUUID } from 'node:crypto';
import { formatLog, errorCause, privateValues } from '../../log.mjs';
import { accessSync, constants, existsSync, renameSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { generateDiagram } from '../../media/diagram-generator.mjs';
import { generateVisual } from '../../media/visuals.mjs';
import { generateVideo, mediaPath } from '../../media/videos.mjs';
import { exportVideo } from '../../media/video-export.mjs';
import { sandboxMissing } from '../../media/video-sandbox.mjs';
import { PHASES } from '../../media/cut-state.mjs';
import { workRoot, videoWork, readSaved } from '../../media/video-workspace.mjs';

export const STOPPED = new Error('Rabbithole stopped.');

// A crash before commit restores staged files; a crash after commit finishes removing them.
// The suffix records the owning artifact, including legacy workspaces named only by attempt.
export function recoverStaged(store, dir) {
    for (const folder of [join(dir, 'videos'), workRoot(dir)]) {
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
        if (a.kind === 'discussion') return discussionArtifact(a);
        if (a.kind === 'visual' && a.status === 'pending') {
            const job = videos.get(a.id);
            return { ...a, source: job?.source ?? null, ...(job && { startedAt: job.startedAt }) };
        }
        if (a.kind !== 'video') return a;
        delete a.source;
        if (a.status === 'pending' && a.conversation) {
            const job = videos.get(a.id);
            return {
                ...a,
                phase: job?.phase ?? 'planning',
                ...(job && { startedAt: job.startedAt, phaseStartedAt: job.phaseStartedAt }),
                ...(job?.progress !== undefined && { progress: job.progress }),
                ...(job?.characters !== undefined && { characters: job.characters }),
                ...(job?.frames !== undefined && { frames: job.frames }),
                ...(job?.cuts !== undefined && { cut: job.cut, cuts: job.cuts }),
                ...(job?.cutRows && { cutRows: job.cutRows }),
                ...(job?.drawing && { drawing: job.drawing }),
            };
        }
        if (a.status !== 'ready') return a;
        // Exported means the MP4 exists; a saved video without one plays its cuts live, unless it has none.
        if (readable(mediaPath(dir, a.id))) return { ...a, exported: true };
        // Trashing a video from the library deletes its production work, so it can no longer play.
        return {
            ...a,
            exported: false,
            ...((!readSaved(artifact.source) || !existsSync(videoWork(dir, a.id))) && {
                available: false,
            }),
        };
    };
    // One job per attempt; it runs detached from any reply stream and only its own attempt can publish.
    const startVideo = (job, parentSignal, previous) => {
        const running = {
            controller: new AbortController(),
            conversation: job.conversation,
            artifact: job.id,
            phase: 'planning',
            progress: undefined,
            startedAt: Date.now(),
            phaseStartedAt: Date.now(),
        };
        const cancel = () => running.controller.abort(parentSignal.reason);
        parentSignal?.addEventListener('abort', cancel, { once: true });
        if (parentSignal?.aborted) cancel();
        const input = JSON.parse(job.input),
            selection = input.selection ?? smart().resolved,
            // Jobs frozen before ADR 0004 hold one selection, which keeps both roles.
            chat = input.chat ? { ...input.chat } : selection;
        videos.set(job.id, running);
        videoJobs.add(running);
        const fields = { id: job.id, task: 'video' };
        const stage = (name, detail = {}) =>
            ctx.log(formatLog('info', 'media', name, { ...fields, ...detail }));
        let progressStep = 0;
        stage('plan');
        running.done = Promise.resolve()
            .then(async () => {
                // Nothing starts by itself once the tools or the Windows sandbox are ready; the learner asks again.
                const waiting = sandboxMissing() ?? ctx.downloads?.videoWaiting();
                if (waiting) throw new Error(waiting);
                const resolve = async (choice, role, check = true) => {
                    const provider = pick(choice);
                    choice.model ??=
                        (await provider.model?.({ ...choice, thread: null })) ??
                        (await provider.models()).find((m) => m.isDefault)?.model ??
                        null;
                    const invalid = check && (await selectionError(choice));
                    if (invalid)
                        throw new Error(
                            `${invalid.error} Check ${role}, then request a new video.`,
                        );
                    return provider;
                };
                const provider = await resolve(selection, 'Smart in Settings → Models');
                const chatProvider =
                    chat === selection
                        ? provider
                        : // Like a reply, the chat selection is checked only when it names an effort.
                          await resolve(
                              chat,
                              'the conversation’s chat model',
                              chat.effort !== null,
                          );
                // Legacy jobs acquire a smart selection only on explicit Retry; newer jobs keep both across attempts.
                const frozen = JSON.stringify({ ...input, selection, ...(input.chat && { chat }) });
                const owned = store.videoInput(job.conversation, job.id, job.attempt, frozen);
                if (!owned || running.controller.signal.aborted) return;
                // Each call is metered under the selection that made it.
                const meter = (base, choice) => ({
                    generate: (...args) =>
                        metered(base, 'video', `${job.attempt}:${randomUUID()}`, choice, {
                            stage: args[0].stage,
                            ...(args[0].cut && { cut: args[0].cut }),
                            message: job.message,
                        }).generate(...args),
                });
                await generateVideo({
                    provider: meter(provider, selection),
                    selection,
                    chat: { provider: meter(chatProvider, chat), selection: chat },
                    store,
                    dir,
                    artifact: { ...job, input: frozen },
                    previous,
                    signal: running.controller.signal,
                    timeout: ctx.videoTimeout,
                    snapshot: ctx.videoSnapshot,
                    narrate: ctx.videoNarrate,
                    manim: ctx.videoManim,
                    embed: ctx.videoEmbed,
                    stills: () => ctx.pieceStills.fill(),
                    search: ctx.search,
                    readsImages: await ctx.readsImages(chat).catch(() => false),
                    capable: await ctx.toolCapable(selection).catch(() => false),
                    writerCapable: await ctx.toolCapable(chat).catch(() => false),
                    mcp: ctx.mcp,
                    onWarning: (cause) =>
                        ctx.log(
                            formatLog('warn', 'media', 'warning', {
                                ...fields,
                                cause: errorCause(cause, privateValues(input)),
                                next: 'Run npm start to check or repair the video runtime, then request a new video.',
                            }),
                        ),
                    onStage: stage,
                    onPhase: (phase, progress, detail = {}) => {
                        if (videos.get(job.id) !== running || running.controller.signal.aborted)
                            return;
                        // Cut rows may move back (ready to repairing) even when the phase cannot.
                        if (detail.cutRows) running.cutRows = detail.cutRows;
                        running.drawing = detail.drawing;
                        // Phases only advance, so the reported step and bar never move backward.
                        if (PHASES.indexOf(phase) < PHASES.indexOf(running.phase)) return;
                        if (running.phase !== phase) {
                            running.phaseStartedAt = Date.now();
                            if (phase === 'saving') stage('saving');
                        }
                        if (phase === 'saving' && Number.isFinite(progress)) {
                            const step = Math.min(4, Math.floor(progress * 4));
                            while (progressStep < step)
                                stage('render', { progress: ++progressStep * 25 });
                        }
                        running.phase = phase;
                        running.progress = Number.isFinite(progress)
                            ? Math.min(1, Math.max(0, progress))
                            : undefined;
                        // Counts only: planning reports characters written, cut phases n of N, saving the total frame count.
                        running.characters = Number.isFinite(detail.characters)
                            ? detail.characters
                            : undefined;
                        running.frames = Number.isFinite(detail.frames) ? detail.frames : undefined;
                        running.cut = Number.isFinite(detail.cut) ? detail.cut : undefined;
                        running.cuts = Number.isFinite(detail.cuts) ? detail.cuts : undefined;
                    },
                });
            })
            // A job stopped with the app stays pending, so the next start marks it interrupted.
            .catch((error) => {
                const stopped = ctx.stopping || running.controller.signal.aborted;
                ctx.log(
                    formatLog(stopped ? 'info' : 'error', 'media', stopped ? 'stopped' : 'failed', {
                        ...fields,
                        ...(!stopped && {
                            cause: errorCause(error, privateValues(input)),
                            next: 'Check Smart model settings and the video runtime, then request a new video.',
                        }),
                    }),
                );
                if (!ctx.stopping && running.controller.signal.reason !== STOPPED)
                    store.finishVideo(job.conversation, job.id, job.attempt, {}, error.message);
            })
            .finally(() => {
                parentSignal?.removeEventListener('abort', cancel);
                videoJobs.delete(running);
                if (videos.get(job.id) === running) videos.delete(job.id);
            });
        return running;
    };
    const runVisual = async (artifact, signal, onPartial) => {
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
                'Could not choose the conversation’s chat model. Check the chat model, then Retry.',
            );
        }
        if (signal.aborted) throw signal.reason;
        const invalid = await selectionError(selection);
        if (signal.aborted) throw signal.reason;
        if (invalid)
            throw new Error(`${invalid.error} Check the conversation’s chat model, then Retry.`);
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
                metered(provider, 'diagram', `${artifact.id}:${randomUUID()}`, selection, {
                    stage: 'visual',
                    message: artifact.message,
                }).generate(...args),
        };
        const capable = await ctx.toolCapable(selection);
        if (signal.aborted) throw signal.reason;
        return generateVisual(metering, selection, input, signal, ctx.visualTimeout, onPartial, {
            capable,
            mcp: ctx.mcp,
        });
    };
    // Explicit Retry runs detached like a video job, with the same stop/delete/polling lifecycle.
    const startDrawing = (artifact, parentSignal, onUpdate = () => {}) => {
        const running = {
            controller: new AbortController(),
            conversation: artifact.conversation,
            artifact: artifact.id,
            startedAt: Date.now(),
        };
        const cancel = () => running.controller.abort(parentSignal.reason);
        parentSignal?.addEventListener('abort', cancel, { once: true });
        videos.set(artifact.id, running);
        videoJobs.add(running);
        ctx.log(formatLog('info', 'media', 'started', { id: artifact.id, task: artifact.kind }));
        running.done = (async () => {
            const tree = store.tree(artifact.conversation),
                selection = { provider: tree.provider, model: tree.model };
            const source =
                artifact.kind === 'visual'
                    ? await runVisual(artifact, running.controller.signal, (source) => {
                          if (
                              videos.get(artifact.id) !== running ||
                              running.controller.signal.aborted
                          )
                              return;
                          const current = store.artifact(artifact.conversation, artifact.id);
                          if (current?.status !== 'pending') return;
                          running.source = source;
                          onUpdate(live(current));
                      })
                    : await generateDiagram(
                          metered(
                              pick(tree),
                              'diagram',
                              `${artifact.id}:${randomUUID()}`,
                              selection,
                              {
                                  message: artifact.message,
                              },
                          ),
                          selection,
                          JSON.parse(artifact.input),
                          running.controller.signal,
                          ctx.diagramTimeout,
                          ctx.diagramParse,
                      );
            if (!running.controller.signal.aborted) {
                store.finishArtifact(artifact.conversation, artifact.id, source);
                ctx.log(
                    formatLog('info', 'media', 'saved', { id: artifact.id, task: artifact.kind }),
                );
            }
        })()
            // Stopping leaves it pending, so startup recovery marks it failed; it never retries by itself.
            .catch((error) => {
                const stopped = ctx.stopping || running.controller.signal.aborted;
                ctx.log(
                    formatLog(stopped ? 'info' : 'error', 'media', stopped ? 'stopped' : 'failed', {
                        id: artifact.id,
                        task: artifact.kind,
                        ...(!stopped && {
                            cause: errorCause(error, privateValues(artifact.input)),
                            next:
                                artifact.kind === 'visual'
                                    ? 'Check the conversation’s chat model, then Retry the visual.'
                                    : 'Check the conversation’s chat model, then Retry the diagram.',
                        }),
                    }),
                );
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
    // One export per video, keyed by its library id; a failed one stays listed until the next press retries it.
    const startExport = (id) => {
        const current = ctx.exports.get(id);
        if (current && !current.error) return current;
        const saved = store.libraryCuts(id);
        const running = { controller: new AbortController(), artifact: id, progress: 0 };
        const fields = { id, task: 'export' };
        let step = 0;
        ctx.exports.set(id, running);
        videoJobs.add(running);
        ctx.log(formatLog('info', 'media', 'export', fields));
        running.done = exportVideo({
            dir,
            id,
            attempt: saved.attempt,
            source: saved.source,
            signal: running.controller.signal,
            render: ctx.videoRender,
            onProgress: (progress) => {
                running.progress = Math.max(running.progress, Math.min(1, progress));
                while (step < Math.floor(running.progress * 4))
                    ctx.log(
                        formatLog('info', 'media', 'render', { ...fields, progress: ++step * 25 }),
                    );
            },
        })
            .then(() => {
                ctx.log(formatLog('info', 'media', 'exported', fields));
                if (ctx.exports.get(id) === running) ctx.exports.delete(id);
            })
            .catch((error) => {
                const stopped = running.controller.signal.aborted;
                ctx.log(
                    formatLog(stopped ? 'info' : 'error', 'media', stopped ? 'stopped' : 'failed', {
                        ...fields,
                        ...(!stopped && {
                            cause: errorCause(error),
                            next: 'Run npm start to check or repair the video runtime, then Retry the export.',
                        }),
                    }),
                );
                if (!stopped) running.error = error.message;
                else if (ctx.exports.get(id) === running) ctx.exports.delete(id);
            })
            .finally(() => videoJobs.delete(running));
        return running;
    };
    return { live, startVideo, startDrawing, startExport };
}
