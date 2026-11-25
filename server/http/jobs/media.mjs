import { discussionArtifact } from '../../media/discussions.mjs';
import { randomUUID } from 'node:crypto';
import { formatLog, errorCause, privateValues } from '../../log.mjs';
import { accessSync, constants, existsSync, renameSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { generateDiagram } from '../../media/diagram-generator.mjs';
import { generateVisual } from '../../media/visuals.mjs';
import { generateVideo, videoCall, videoEngines, mediaPath } from '../../media/videos.mjs';
import { exportVideo } from '../../media/video-export.mjs';
import { sandboxMissing } from '../../media/video-sandbox.mjs';
import { PHASES } from '../../media/cut-state.mjs';
import { workRoot, videoWork, readSaved } from '../../media/video-workspace.mjs';

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
    const { store, dir, jobs, pick, selectionError, smart, metered } = ctx;
    // Frozen inputs stay server-side for every kind; explicit worker actions reuse them.
    const live = (artifact) => {
        const { input, attempt, previous, ...a } = artifact;
        if (previous) a.hasPrevious = true;
        if (a.kind === 'discussion') return discussionArtifact(a);
        if (a.kind === 'visual' && a.status === 'pending') {
            const job = jobs.get('drawing', a.id);
            return { ...a, source: job?.source ?? null, ...(job && { startedAt: job.startedAt }) };
        }
        if (a.kind !== 'video') return a;
        delete a.source;
        // A video waiting for its tools shows how they are now, not when it was asked for.
        if (a.status === 'failed' && a.error?.startsWith('Video tools '))
            return { ...a, error: ctx.downloads?.videoWaiting() ?? a.error };
        if (a.status === 'pending' && a.conversation) {
            const job = jobs.get('video', a.id);
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
        // A canceled attempt may still be winding down when Retry replaces it; delete and stop wait for both.
        const replaced = jobs.get('video', job.id)?.done;
        return jobs.start(
            'video',
            job.id,
            job.conversation,
            (running) =>
                Promise.allSettled([replaced, runVideo(running, job, parentSignal, previous)]),
            { files: true },
        );
    };
    const runVideo = (running, job, parentSignal, previous) => {
        Object.assign(running, {
            phase: 'planning',
            progress: undefined,
            startedAt: Date.now(),
            phaseStartedAt: Date.now(),
        });
        store.videoStarted(job.conversation, job.id, job.attempt, running.startedAt);
        const cancel = () => running.controller.abort(parentSignal.reason);
        parentSignal?.addEventListener('abort', cancel, { once: true });
        if (parentSignal?.aborted) cancel();
        const input = JSON.parse(job.input),
            selection = input.selection ?? smart().resolved,
            // Jobs frozen before ADR 0004 hold one selection, which keeps both roles.
            chat = input.chat ? { ...input.chat } : selection;
        const fields = { id: job.id, task: 'video' };
        const stage = (name, detail = {}) =>
            ctx.log(formatLog('info', 'media', name, { ...fields, ...detail }));
        let progressStep = 0;
        stage('plan');
        running.done = Promise.resolve()
            .then(async () => {
                // A video waiting for its tools renders once they are ready (resume); after the Windows sandbox, the learner asks again.
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
                const writerCapable = await ctx.toolCapable(chat).catch(() => false);
                await generateVideo(
                    {
                        dir,
                        artifact: { ...job, input: frozen },
                        previous,
                        signal: running.controller.signal,
                    },
                    {
                        call: videoCall(
                            meter(provider, selection),
                            selection,
                            await ctx.toolCapable(selection).catch(() => false),
                        ),
                        write: videoCall(meter(chatProvider, chat), chat, writerCapable),
                        writerCapable,
                        readsImages: await ctx.readsImages(chat).catch(() => false),
                        engines: videoEngines({
                            snapshot: ctx.videoSnapshot,
                            manim: ctx.videoManim,
                        }),
                        store,
                        narrate: ctx.videoNarrate,
                        timeout: ctx.videoTimeout,
                        embed: ctx.videoEmbed,
                        stills: () => ctx.pieceStills.fill(),
                        search: ctx.search,
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
                            if (
                                jobs.get('video', job.id) !== running ||
                                running.controller.signal.aborted
                            )
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
                            running.frames = Number.isFinite(detail.frames)
                                ? detail.frames
                                : undefined;
                            running.cut = Number.isFinite(detail.cut) ? detail.cut : undefined;
                            running.cuts = Number.isFinite(detail.cuts) ? detail.cuts : undefined;
                        },
                    },
                );
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
                if (!ctx.stopping)
                    store.finishVideo(job.conversation, job.id, job.attempt, {}, error.message);
            })
            .finally(() => parentSignal?.removeEventListener('abort', cancel));
        return running.done;
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
        // A new version changes the one it replaced, now in the previous slot.
        const current = input.differentVersion ? JSON.parse(artifact.previous)?.source : undefined;
        return generateVisual(
            metering,
            selection,
            { ...input, current },
            signal,
            ctx.visualTimeout,
            onPartial,
            {
                capable,
                mcp: ctx.mcp,
                // The first attempt's rejection is sent back to the model, so only this line records it.
                onRetry: (reason) =>
                    ctx.log(
                        formatLog('warn', 'media', 'retry', {
                            id: artifact.id,
                            task: artifact.kind,
                            provider: selection.provider,
                            model: selection.model,
                            cause: errorCause(reason, privateValues(artifact.input)),
                        }),
                    ),
            },
        );
    };
    // Explicit Retry runs detached like a video job, with the same stop/delete/polling lifecycle.
    const startDrawing = (artifact, parentSignal, onUpdate) =>
        jobs.start('drawing', artifact.id, artifact.conversation, (running) =>
            runDrawing(running, artifact, parentSignal, onUpdate),
        );
    const runDrawing = (running, artifact, parentSignal, onUpdate = () => {}) => {
        running.startedAt = Date.now();
        const cancel = () => running.controller.abort(parentSignal.reason);
        parentSignal?.addEventListener('abort', cancel, { once: true });
        ctx.log(formatLog('info', 'media', 'started', { id: artifact.id, task: artifact.kind }));
        running.done = (async () => {
            const tree = store.tree(artifact.conversation),
                selection = { provider: tree.provider, model: tree.model };
            const source =
                artifact.kind === 'visual'
                    ? await runVisual(artifact, running.controller.signal, (source) => {
                          if (
                              jobs.get('drawing', artifact.id) !== running ||
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
                if (!ctx.stopping)
                    store.finishArtifact(artifact.conversation, artifact.id, null, error.message);
            })
            .finally(() => parentSignal?.removeEventListener('abort', cancel));
        return running.done;
    };
    // One export per video, keyed by its library id; a failed one stays listed until the next press retries it.
    // A library video belongs to no conversation, so deleting one never stops its export.
    const startExport = (id) => {
        const current = jobs.get('export', id);
        if (current && !current.error) return current;
        return jobs.start('export', id, null, (running) => runExport(running, id), { keep: true });
    };
    const runExport = (running, id) => {
        const saved = store.libraryCuts(id);
        running.progress = 0;
        const fields = { id, task: 'export' };
        let step = 0;
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
                jobs.remove(running);
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
                else jobs.remove(running);
            });
        return running.done;
    };
    const resume = () => {
        if (ctx.stopping || ctx.downloads.videoWaiting()) return;
        for (const { conversation, id } of store.waitingVideos()) {
            const job = store.retryVideo(conversation, id);
            if (job) startVideo(job);
        }
    };
    ctx.downloads?.subscribe(resume);
    return { live, startVideo, startDrawing, startExport };
}
