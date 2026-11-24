import { readFileSync } from 'node:fs';
import { mkdir, rm, cp, access } from 'node:fs/promises';
import { join } from 'node:path';
import { edgeNarration } from './narration.mjs';
import {
    pieceNames,
    PLAN_INSTRUCTIONS,
    EXHIBITS_NOTE,
    CLIPS_NOTE,
    MAX_SOURCE,
} from './video-plan.mjs';
import { fetchExhibit, videoMedia } from './exhibits.mjs';
import { detectClips } from './clips.mjs';
import { startCuts, makeCut, cutRows } from './video-cuts.mjs';
import { CUT_STATES, cutState, playable } from './cut-state.mjs';
import { mediaCall, raced } from './media-call.mjs';
import { planBuilder, PIECES_PLAN_NOTE } from './plan-calls.mjs';
import { drawPieces, embedded } from './video-pieces.mjs';
import { sandboxProcess, REPO } from './video-sandbox.mjs';
import { detectManim, videoBrowser } from './manim.mjs';
import { sandboxManim, checkManim } from './manim-cut.mjs';
import { cutEngines } from './cut-engines.mjs';
import { attemptWork, cutWork, cutAudio, readSaved } from './video-workspace.mjs';

export const KIT = readFileSync(new URL('./video-kit.tsx', import.meta.url), 'utf8');
// The learner must name a video; the tutor's block alone never starts one.
export const asksForVideo = (text) =>
    !/\b(?:don['’]t|do not|never)\s+(?:\w+\s+){0,3}(?:make|create|generate|render|produce|show|give|animate)\b/i.test(
        text,
    ) &&
    /\b(?:make|create|generate|render|produce|show|give|want|need)\b[^.!?\n]{0,120}\b(?:video|animation|clip|movie)\b|\banimate\b|\b(?:video|animation|clip|movie)\s*,?\s+please\b/i.test(
        text,
    );

export function sandboxRender(workspace, output, signal, onProgress = () => {}, timeout) {
    const budget =
        timeout ??
        300000 +
            (JSON.parse(readFileSync(join(workspace, 'narration.json'), 'utf8')).durationInFrames /
                30) *
                30000;
    return sandboxProcess(
        workspace,
        [
            process.execPath,
            join(REPO, 'server/media/video-render.mjs'),
            workspace,
            output,
            join(REPO, 'node_modules'),
            videoBrowser(),
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
            videoBrowser(),
            JSON.stringify(stills),
        ],
        signal,
        () => {},
        300000 + stills.length * 30000,
    );
}

const OVERRUN = 'Video generation ran over two hours.';
const VIDEO_CALL = {
    role: 'video',
    bytes: MAX_SOURCE,
    overflow: 'Video composition exceeds 64 KiB.',
    incomplete: 'Video composition did not complete.',
    failed: (reason) => `Video provider failed: ${reason}`,
};

export const mediaPath = (dir, id) => join(dir, 'videos', `${id}.mp4`);

// The model call the pipeline asks, on one provider and selection; capable: the model calls tools natively.
// (instructions, input, { signal, stage, cut, onText, images, tools }): stage (plan, pieces, improve, audit, repair,
// fix or cut) and the cut it serves ride along for the usage meter; tools: { tools, mcp, runTool, textTools } for a
// call that reports through tool calls.
export const videoCall =
    (provider, selection, capable = false) =>
    (instructions, input, { tools, ...options }) =>
        mediaCall(provider, selection, VIDEO_CALL, {
            instructions,
            input,
            ...options,
            tools: tools && { ...tools, capable, reportsByTools: true },
        });

// Each kind's engine for one job ({ signal, stop, onWarning }): snapshot renders audit stills, manim is
// { detect, render, check? }.
export const videoEngines =
    ({
        snapshot = sandboxSnapshot,
        manim = { detect: detectManim, render: sandboxManim, check: checkManim },
    } = {}) =>
    (job) =>
        cutEngines({ snapshot, manim, ...job });

// The pipeline's one set of dependencies, passed as deps to every step; a missing one is the real thing.
// call and write: the smart and the chat model calls (videoCall); the chat model writes set pieces, cuts, repairs
// and fixes, the smart model plans and audits (ADR 0004). writerCapable: the chat model calls tools natively, so cut
// writers submit through submit_cut; readsImages: it reads images, so the set piece writer sees reference photos.
// engines(job): each kind's engine for this job (videoEngines). store, narrate(script, signal), and timeout: the
// clock's budget for the whole job in ms. embed: texts to look vectors, or null to save pieces without one; stills:
// renders saved or improved library pieces in the background. search: the SearXNG web search tool, with which the
// planner may name exhibits (ADR 0005); exhibit: the exhibit fetcher; clips: probes yt-dlp and ffmpeg, without which
// the planner gets no clip option. mcp: the MCP server tool calls reach. onPhase, onStage and onWarning report the
// learner's progress, log stages and warn.
const DEPS = {
    writerCapable: false,
    readsImages: false,
    engines: videoEngines(),
    narrate: edgeNarration,
    timeout: 7200000,
    embed: null,
    stills: () => {},
    search: null,
    exhibit: fetchExhibit,
    clips: detectClips,
    onPhase: () => {},
    onStage: () => {},
    onWarning: (warning) => console.warn(warning),
};

// The video pipeline, in order: the attempt's workspace and the cuts Retry keeps, the plan, each cut's engine,
// exhibits, set pieces, every cut written, narrated and audited in parallel, then the finished video.
// job: { dir, artifact, previous, signal }; deps: see DEPS.
export async function generateVideo({ dir, artifact, previous, signal }, given) {
    const deps = {
        ...DEPS,
        ...Object.fromEntries(Object.entries(given).filter(([, v]) => v !== undefined)),
    };
    const workspace = attemptWork(dir, artifact.id, artifact.attempt);
    const controller = new AbortController();
    const cancel = () => controller.abort(signal.reason);
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
    const wait = (promise, budget, message) => raced(controller, promise, budget, message);
    // Calls stop only when the model stalls (the providers' idle limit); this guards against a runaway loop.
    const deadline = Date.now() + deps.timeout;
    const overrun = (promise) => wait(promise, Math.max(1, deadline - Date.now()), OVERRUN);
    // Every model call of this job stops with the job and at its deadline.
    for (const role of ['call', 'write']) {
        const model = deps[role];
        deps[role] = (instructions, input, options) =>
            overrun(model(instructions, input, { ...options, signal: controller.signal }));
    }
    const video = {
        dir,
        artifact,
        previous,
        workspace,
        kit: KIT,
        signal: controller.signal,
        stop: (error) => controller.abort(error),
        wait,
        // Read once per job, so a Retry takes the mode set when it starts.
        saving: deps.store.videoMode() === 'saving',
    };
    let published = false;
    try {
        controller.signal.throwIfAborted();
        await mkdir(join(workspace, 'out'), { recursive: true, mode: 0o700 });
        await mkdir(join(workspace, 'tmp'), { recursive: true, mode: 0o700 });
        const prior = previous?.source ? readSaved(previous.source) : null;
        const kept = prior?.plan ? await keptCuts(video, prior) : [];
        const searching =
            !prior?.plan &&
            !!deps.search &&
            deps.store.tutorTools().web_search !== false &&
            (await deps.search.ready({ signal: controller.signal }));
        const clipping = searching && deps.clips();
        const plan = (video.plan =
            prior?.plan ?? (await planVideo(video, deps, searching, clipping)));
        const kinds = deps.engines({
            signal: controller.signal,
            stop: video.stop,
            onWarning: deps.onWarning,
        });
        // Each cut's engine, chosen once; an engine that cannot run here stops the video before any cut is written.
        video.engines = plan.cuts.map((c) => kinds[c.engine]);
        for (const engine of video.engines) engine.ready();
        Object.assign(
            video,
            await videoMedia({
                plan,
                prior,
                from: prior?.plan && attemptWork(dir, artifact.id, previous.attempt),
                // Saving mode fetches no reference photos; exhibits stay.
                searching: searching && !video.saving,
                pictures: video.engines.some((e) => e.pictures),
                fetch: (planned) =>
                    deps.exhibit(planned, {
                        search: deps.search,
                        signal: controller.signal,
                        clips: clipping,
                        tmp: join(workspace, 'tmp'),
                    }),
                workspace,
                signal: controller.signal,
                wait: overrun,
                onWarning: deps.onWarning,
                credit: (resource) => deps.store.addResource(artifact.conversation, resource),
            }),
        );
        // Nor shows the ones a Retry would keep.
        if (video.saving) video.references = [];
        deps.onStage('cuts', { cuts: plan.cuts.length });
        video.names = video.engines.some((e) => e.pictures) ? pieceNames(plan) : [];
        video.data = {
            plan,
            cuts: startCuts(video, kept),
            ...(video.names.length && { pieces: prior?.pieces ?? null }),
            ...(video.exhibits.length && { exhibits: video.exhibits }),
            ...(video.references.length && { references: video.references }),
        };
        progress(video, deps);
        video.persist();
        await drawPieces(video, deps);
        const making = video.cuts.map((_, index) => makeCut(video, index, deps));
        try {
            await Promise.all(making);
        } catch (error) {
            video.stop(error);
            await Promise.allSettled(making);
            // Siblings fail with AbortError once one cut stops the job; report the first real cause.
            throw controller.signal.reason ?? error;
        }
        // Piece improvements run alongside the last audits and never fail the video.
        await Promise.all(video.improving);
        const ready = finish(video, deps);
        published = true;
        deps.onStage('saved');
        return ready;
    } catch (error) {
        controller.abort(error);
        throw error.code ? new Error('Video could not be generated.') : error;
    } finally {
        signal.removeEventListener('abort', cancel);
        // Keep private code and timing; discard bundles, temporary clips, and audio of canceled or stopped attempts.
        // A failed attempt keeps its audio so Retry can reuse the narration.
        const count = video.cuts?.length ?? 0;
        await Promise.all(
            [workspace, ...Array.from({ length: count }, (_, i) => cutWork(workspace, i))].flatMap(
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

// The previous attempt's cuts for Retry. Copy, never share, the old cut folder; timing counts only if its audio
// came along.
async function keptCuts({ dir, artifact, previous, workspace }, prior) {
    const kept = [];
    for (const [i, cut] of prior.cuts.entries()) {
        const from = cutWork(attemptWork(dir, artifact.id, previous.attempt), i),
            to = cutWork(workspace, i);
        const timing =
            cut.timing &&
            (await cp(from, to, { recursive: true })
                .then(() => access(cutAudio(to)))
                .then(
                    () => cut.timing,
                    () => rm(to, { recursive: true, force: true }).then(() => null),
                ));
        kept.push({ ...cut, timing });
    }
    return kept;
}

// The smart model builds the plan through calls; one stop without a valid finish gets a retry with the problem.
// With saved pieces and an embedder, the planner looks up the nearest pieces by name and role before each look.
async function planVideo({ artifact, signal }, deps, searching, clipping) {
    const pieces =
        deps.embed && deps.store.hasPieces()
            ? async (query) => {
                  try {
                      const [vector] = await embedded([query], deps, signal);
                      return vector ? deps.store.nearestPieces(vector) : [];
                  } catch (error) {
                      signal.throwIfAborted();
                      deps.onWarning(`WARN video piece library unavailable: ${error.message}`);
                      return [];
                  }
              }
            : null;
    const planned = async (note = '') => {
        const builder = planBuilder({ exhibits: searching, clips: !!clipping?.ready, pieces });
        let characters = 0;
        const answer = await deps.call(
            PLAN_INSTRUCTIONS +
                (searching ? EXHIBITS_NOTE : '') +
                (clipping?.ready ? CLIPS_NOTE : '') +
                (pieces ? PIECES_PLAN_NOTE : '') +
                (JSON.parse(artifact.input).differentVersion
                    ? '\nCreate a different version: take a different approach than the previous version while explaining the same request.'
                    : '') +
                note,
            artifact.input,
            {
                stage: 'plan',
                onText: (bytes) => deps.onPhase('planning', undefined, { characters: bytes }),
                tools: {
                    tools: builder.tools,
                    textTools: builder.textTools,
                    mcp: deps.mcp,
                    runTool: (name, input) => {
                        const result = builder.run(name, input);
                        characters += JSON.stringify(input).length;
                        deps.onPhase('planning', undefined, { characters });
                        return result;
                    },
                },
            },
        );
        builder.read(answer);
        return builder;
    };
    let builder = await planned();
    if (builder.problem())
        builder = await planned(
            `\nYour previous attempt stopped without a valid finish: ${builder.problem()}. Plan the whole video again through the tools and end with finish_video.`,
        );
    if (builder.problem()) throw new Error(`Video plan is incomplete: ${builder.problem()}.`);
    return builder.plan();
}

// Saving and progress: video.persist saves the live data and reports the phase from real cut state; cuts 1 and 2
// (every cut when there are two or fewer) decide when playback can start, so the learner rarely waits at the first
// join; saving needs every cut playable. video.onDrawing reports set piece drawing.
function progress(video, deps) {
    const { plan, artifact, signal, data } = video,
        count = plan.cuts.length;
    let writtenCuts = 0,
        narratedCuts = 0,
        playableStage = false,
        live,
        drawing;
    const report = () => {
        // Per-cut rows and set piece drawing ride along with every phase report.
        const say = (phase, progress, detail) =>
            deps.onPhase(phase, progress, {
                ...detail,
                cutRows: cutRows(live.cuts, plan),
                ...(live.pieces === null && drawing && { drawing }),
            });
        const ready = live.cuts.filter(playable).length;
        if (live.pieces === null) return say('pieces');
        const waiting = live.cuts.slice(0, 2).find((c) => !playable(c));
        const phase = waiting && CUT_STATES[cutState(waiting)].phase;
        if (phase === 'writing')
            return say(phase, undefined, {
                cut: live.cuts.filter((c) => c.code).length,
                cuts: count,
            });
        if (phase === 'auditing')
            return say(phase, undefined, {
                cut: live.cuts.filter((c) => c.audited).length,
                cuts: count,
            });
        // A failed cut reports no phase; its rows still update.
        if (waiting) return say(phase);
        if (!playableStage) deps.onStage('playable', { cut: ready, cuts: count });
        playableStage = true;
        say('playable', undefined, { cut: ready, cuts: count });
    };
    video.onDrawing = (value) => {
        drawing = value;
        if (live) report();
    };
    video.persist = () => {
        signal.throwIfAborted();
        const written = data.cuts.filter((c) => c.status === 'written').length;
        if (written > writtenCuts) deps.onStage('cuts written', { cut: written, cuts: count });
        writtenCuts = Math.max(writtenCuts, written);
        const narrated = data.cuts.filter((c) => c.timing).length;
        if (narrated > narratedCuts) deps.onStage('narration', { cut: narrated, cuts: count });
        narratedCuts = Math.max(narratedCuts, narrated);
        if (!deps.store.videoData(artifact.conversation, artifact.id, artifact.attempt, data))
            throw new Error('Video job no longer owns this output.');
        live = data;
        report();
    };
}

// The saved video is its playable cuts; an MP4 is rendered only when the learner exports it.
function finish({ plan, artifact, signal, cuts }, { store, onPhase }) {
    onPhase('saving');
    const owner = store.artifact(artifact.conversation, artifact.id);
    if (owner?.attempt !== artifact.attempt || owner.status !== 'pending' || signal.aborted)
        throw new Error('Video job no longer owns this output.');
    let ready;
    try {
        ready = store.finishVideo(artifact.conversation, artifact.id, artifact.attempt, {
            title: plan.title,
            description: plan.description,
            duration: cuts.reduce((n, c) => n + c.timing.durationInFrames, 0) / 30,
        });
    } catch {}
    if (ready?.status !== 'ready') throw new Error('Video could not be saved.');
    return ready;
}
