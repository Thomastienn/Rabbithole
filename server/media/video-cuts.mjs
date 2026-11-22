import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { REPAIR_NOTE, REPAIR_PATCH_NOTE, FIX_NOTE, SUBMIT_NOTE, SUBMIT_CUT } from './video-cut.mjs';
import { cutJoin, pieceNames, CUT_ATTEMPTS, CUT_CHECKS, CUT_PAUSE_FRAMES } from './video-plan.mjs';
import { patched, withSource } from './patches.mjs';
import { auditReport, auditFix } from './audit-answers.mjs';
import { stageNarration } from './narration.mjs';
import { withoutPaths, sandboxOutput } from './video-sandbox.mjs';
import { writeSetPieces } from './video-pieces.mjs';
import { stageCut } from './video-stage.mjs';
import { cutState } from './cut-state.mjs';
import { cutWork } from './video-workspace.mjs';

// Live rows: a row's state may move back (ready to repairing) while the job phase only moves forward.
export const cutRows = (cuts, plan) =>
    cuts.map((c, i) => ({ cut: i + 1, title: plan.cuts[i].purpose, state: cutState(c) }));

// A cut's final validation or render failure; provider, sign-in and runtime errors keep their own wording.
export const cutError = (reason, index, count) =>
    new Error(
        `Cut ${index + 1} of ${count}: ${withoutPaths(reason).replace(/\.$/, '')}. Retry keeps the other cuts.`,
    );

// A tool-calling writer submits through submit_cut until one submission validates; each error goes back to it.
// validate(code) checks a submission and returns the accepted cut code; failed is this attempt's failed code.
function cutSubmission(validate, failed, mcp) {
    const submission = { accepted: null, rejected: null };
    let checks = 0;
    submission.tool = {
        tools: [SUBMIT_CUT],
        mcp,
        runTool: async (_name, input) => {
            if (submission.accepted !== null) return 'The cut is already accepted; end your turn.';
            if (checks >= CUT_CHECKS) throw new Error('No checks left; end your turn.');
            const diff = typeof input?.patch === 'string',
                base = submission.rejected?.code ?? failed,
                code = diff ? base && patched(base, input.patch) : input?.code;
            if (typeof code !== 'string' || !code.trim())
                throw new Error(
                    diff
                        ? 'patch does not apply; submit the whole source as code.'
                        : 'Submit code, the whole cut source, or patch, a diff of it.',
                );
            checks++;
            try {
                submission.accepted = await validate(code);
            } catch (e) {
                submission.rejected = { error: e, code };
                throw e;
            }
            return 'Cut accepted. End your turn.';
        },
    };
    return submission;
}

export async function writeCuts({
    plan,
    workspace,
    kit,
    // Each cut's engine (cutEngines), chosen once by the caller.
    engines,
    call,
    write = call,
    narrate,
    signal,
    save,
    wait,
    stop,
    kept = [],
    pieces = null,
    onPieces = async () => {},
    // Looks to each one's top library matches; [] when no embedder is usable.
    matches = async () => [],
    // Library id and audit reason of a saved piece flagged as poor; improves it for future videos only.
    onPoorPiece = async () => {},
    // Fetched exhibits ({id, cut, kind, title, site, url, text?, by?, show?, file?, type?}); files live in their cut folder.
    exhibits = [],
    // Set pieces' reference photos ({name, file, type, …}) outside any cut; the piece writer sees them if it readsImages.
    references = [],
    readsImages = false,
    // Set piece drawing progress while their module streams: { drawing: names, drawn, total }.
    onDrawing = () => {},
    // The MCP server Claude and Codex reach tools through.
    mcp,
    // Whether the chat model, which writes the cuts, calls tools natively.
    writerCapable = false,
}) {
    // Retry keeps code from cuts not marked failed and timing whose audio was copied; the rest is written again.
    const cuts = plan.cuts.map((c, i) => ({
        engine: c.engine,
        status: 'pending',
        code: (kept[i]?.status !== 'failed' && kept[i]?.code) || null,
        timing: kept[i]?.timing ?? null,
        // A kept cut keeps its settled audit and the marks it chose.
        ...(kept[i]?.status !== 'failed' &&
            kept[i]?.code &&
            kept[i].audited && {
                audited: true,
                ...(kept[i].emphasis && { emphasis: kept[i].emphasis }),
            }),
    }));
    const names = engines.some((e) => e.pictures) ? pieceNames(plan) : [];
    const data = {
        plan,
        cuts,
        ...(names.length && { pieces }),
        ...(exhibits.length && { exhibits }),
        ...(references.length && { references }),
    };
    const photo = (r) => ({ path: join(workspace, r.file), type: r.type });
    const exhibitsOf = (index) => exhibits.filter((e) => e.cut === index);
    // Writers and audits see the cut's fetched exhibits, never the planned ones that may have been dropped.
    const task = (index) => {
        const { exhibits: _planned, ...cut } = plan.cuts[index];
        const shown = exhibitsOf(index).map(({ file, type, url, cut, ...e }) => e);
        return {
            styleBrief: plan.styleBrief,
            // A 3D cut's writer always gets a camera note; the default orbit when the plan gave none.
            cut: cut.dimension === '3d' ? { camera: 'slow orbit around the focus', ...cut } : cut,
            previousEndState: index ? plan.cuts[index - 1].endState : null,
            ...(data.pieces && engines[index].pictures && { setPieces: data.pieces }),
            ...(shown.length && { exhibits: shown }),
        };
    };
    const persist = () => {
        signal.throwIfAborted();
        save(data);
    };
    persist();
    let choices = null,
        parts = [],
        library = {};
    if (names.length && !data.pieces)
        ({
            source: data.pieces,
            choices,
            parts,
        } = await writeSetPieces({
            plan,
            names,
            write,
            matches,
            signal,
            onDrawing,
            photos: readsImages ? references.map((r) => ({ name: r.name, image: photo(r) })) : [],
        }));
    if (data.pieces && !pieces) {
        persist();
        library = (await onPieces(data.pieces, names, choices, parts)) ?? {};
    }
    // Each audit shares its pre-audit last frame with the next cut's audit, so audits never wait on each other.
    const lastFrames = cuts.map(() => Promise.withResolvers());
    const improving = [],
        flagged = new Set();
    // Narration depends only on the plan, never on a cut writer or a neighbouring cut finishing.
    const attempts = cuts.map(() => 0);
    const writerInstructions = (index) =>
        engines[index].instructions({
            dimension: plan.cuts[index].dimension,
            exhibits: exhibitsOf(index).length > 0,
        });
    // The cut source rules, then the engine's check of the staged cut, before narration or render.
    const validate = async (index, raw) => {
        cuts[index].code = engines[index].source(raw, plan.styleBrief);
        await engines[index].check(() => stage(index));
    };
    const rewrite = async (index, reason) => {
        let error = reason && new Error(reason),
            failed = reason && cuts[index].code;
        // A live row state only; the job phase still moves forward.
        if (reason) {
            cuts[index].step = 'repairing';
            persist();
        }
        while (attempts[index] < CUT_ATTEMPTS) {
            attempts[index]++;
            // A repair is also the cut's audit, so it sees the failed code and the previous cut's last frame.
            const previous = error && index ? await lastFrames[index - 1].promise : null;
            signal.throwIfAborted();
            const submission = cutSubmission(
                    async (code) => (await validate(index, code), cuts[index].code),
                    failed,
                    mcp,
                ),
                submit = writerCapable && submission.tool;
            // Provider/auth failures are final; only validation/render failures spend a repair attempt.
            let raw = null;
            try {
                const input = {
                    ...task(index),
                    ...(error && { validationError: error.message, previousLastFrame: !!previous }),
                };
                const call = (stage, note, text) =>
                    write(writerInstructions(index) + (submit ? SUBMIT_NOTE : '') + note, text, {
                        stage,
                        cut: index + 1,
                        images: previous ? [previous] : undefined,
                        tools: submit,
                    });
                // A repair of failed code answers a patch; when it does not apply, one whole-source call within this attempt.
                // A writer that submitted through submit_cut is settled by its submissions.
                if (error && failed) {
                    const answer = await call(
                        'repair',
                        REPAIR_PATCH_NOTE,
                        withSource(input, 'failedCode', failed),
                    );
                    raw =
                        submission.accepted === null && !submission.rejected
                            ? patched(failed, answer)
                            : '';
                }
                raw ??= await call(
                    error ? 'repair' : 'cut',
                    error ? REPAIR_NOTE : '',
                    JSON.stringify({ ...input, ...(error && failed && { failedCode: failed }) }),
                );
            } catch (e) {
                if (!e.invalidOutput) throw e;
                error = e;
                failed = null;
                continue;
            }
            if (submission.accepted === null && submission.rejected) {
                ({ error, code: failed } = submission.rejected);
                continue;
            }
            // A writer without tools, or one that answered with the source anyway, is validated from its answer.
            if (submission.accepted === null) {
                failed = raw;
                try {
                    await validate(index, raw);
                } catch (e) {
                    error = e;
                    continue;
                }
            }
            // New code makes any earlier clip stale.
            delete cuts[index].clip;
            delete cuts[index].step;
            if (error) cuts[index].audited = true;
            persist();
            return;
        }
        throw cutError(error.message, index, plan.cuts.length);
    };
    const stage = async (index) => {
        const dir = cutWork(workspace, index);
        await mkdir(dir, { recursive: true, mode: 0o700 });
        return stageCut({
            dir,
            cut: cuts[index],
            plan,
            pieces: data.pieces,
            kit,
            emphasis: cuts[index].emphasis ?? plan.cuts[index].emphasis ?? [],
            exhibits: exhibitsOf(index),
            engine: engines[index],
        });
    };
    // What the engine plays beyond the code, such as a rendered clip; whether it made one.
    const play = async (index) => {
        const clip = await engines[index].play(
            () => stage(index),
            cuts[index].timing.durationInFrames,
        );
        if (!clip) return false;
        cuts[index].clip = `cut-${index}/${clip}`;
        persist();
        return true;
    };
    // The contact sheet, then stills at each sentence end and the narration's last frame, rendered from the staged cut.
    const shoot = async (index) => {
        const dir = await stage(index),
            { sentences, audioFrames } = cuts[index].timing;
        const frames = [
            ...new Set([...sentences.map((s) => Math.min(s.endFrame, audioFrames)), audioFrames]),
        ].map((f) => Math.max(0, f - 1));
        const stills = [{ sheet: true, frame: 0 }, ...frames.map((frame) => ({ frame }))].map(
            (s) => ({
                ...s,
                file: join(dir, 'out', randomUUID() + '.jpg'),
            }),
        );
        await engines[index].stills(dir, stills);
        signal.throwIfAborted();
        for (const { file } of stills) {
            const stat = await sandboxOutput(dir, file);
            if (!stat?.size || stat.size > 2 * 1024 * 1024)
                throw new Error('Video snapshot is unreadable.');
        }
        return stills.map(({ file }) => ({ path: file, type: 'image/jpeg' }));
    };
    const audit = async (index) => {
        const cut = cuts[index];
        let own = null;
        try {
            own = await shoot(index);
        } catch (e) {
            signal.throwIfAborted();
            // Cut code that crashed renders no frame, live or final; its writer repairs it.
            if (e.crashed) throw e;
        } finally {
            lastFrames[index].resolve(own?.at(-1) ?? null);
        }
        const before = { code: cut.code, emphasis: cut.emphasis };
        // An audit only improves a cut: no frames, an unusable answer or a fix that will not render keeps the cut as it was.
        if (own?.length && !cut.audited)
            try {
                const previous = index ? await lastFrames[index - 1].promise : null;
                signal.throwIfAborted();
                const audited = {
                    ...task(index),
                    code: cut.code,
                    emphasis: cut.emphasis ?? plan.cuts[index].emphasis ?? [],
                    previousLastFrame: !!previous,
                };
                const draws = (name) =>
                    engines[index].pictures &&
                    new RegExp(`\\b${RegExp.escape(name)}(?:3D)?\\b`).test(cut.code);
                const offered = Object.keys(library).filter(draws);
                const photos = references.filter((r) => draws(r.name));
                const report = auditReport(offered);
                const answer = await call(
                    engines[index].audit(plan.cuts[index].dimension),
                    JSON.stringify({
                        ...audited,
                        ...(offered.length && { libraryPieces: offered }),
                        snapshots: own.length - 1,
                        ...(photos.length && { referencePhotos: photos.map((r) => r.name) }),
                    }),
                    {
                        stage: 'audit',
                        cut: index + 1,
                        images: [...own, ...(previous ? [previous] : []), ...photos.map(photo)],
                        tools: {
                            tools: report.tools,
                            textTools: report.textTools,
                            mcp,
                            runTool: report.run,
                        },
                    },
                );
                report.read(answer);
                // The video keeps the pieces it started with; a flagged piece is improved in the library alongside.
                for (const { name, why } of report.pieces)
                    if (!flagged.has(library[name])) {
                        flagged.add(library[name]);
                        improving.push(onPoorPiece(library[name], why).catch(() => {}));
                    }
                const issues = report.issues();
                if (issues) {
                    cut.step = 'fixing';
                    persist();
                    // The chat model patches the flagged cut once; a patch that does not apply or validate
                    // sends the cut to its repair attempts with the audit's issues. A fix that will not render keeps the cut.
                    const { code, ...rest } = audited;
                    const answer = await write(
                        writerInstructions(index) + FIX_NOTE,
                        withSource({ ...rest, issues }, 'code', code),
                        {
                            stage: 'fix',
                            cut: index + 1,
                            images: previous ? [previous] : undefined,
                        },
                    );
                    try {
                        Object.assign(
                            cut,
                            auditFix(
                                answer,
                                plan.styleBrief,
                                cut.timing.sentences.length,
                                engines[index],
                                code,
                                plan.cuts[index].dimension,
                            ),
                        );
                        await engines[index].check(() => stage(index));
                    } catch (e) {
                        signal.throwIfAborted();
                        const found = issues.map((i) => `${i.where}: ${i.what}`).join('; ');
                        throw Object.assign(
                            new Error(
                                `The cut audit found: ${found}. Its fix patch failed: ${e.message}`,
                            ),
                            { repair: true },
                        );
                    }
                    // A fix must still render: a new clip where the engine plays one, replacing the old only on
                    // success, else new stills.
                    if (!(await play(index))) await shoot(index);
                }
            } catch (e) {
                signal.throwIfAborted();
                Object.assign(cut, before);
                if (before.emphasis === undefined) delete cut.emphasis;
                if (e.repair) throw e;
            }
        delete cut.step;
        cut.audited = true;
        persist();
    };
    const writing = cuts.map(async (cut, index) => {
        const dir = cutWork(workspace, index);
        cut.status = 'writing';
        persist();
        const operations = [
            cut.code ? null : rewrite(index),
            (async () => {
                if (cut.timing) {
                    await mkdir(join(dir, 'out'), { recursive: true, mode: 0o700 });
                    return mkdir(join(dir, 'tmp'), { recursive: true, mode: 0o700 });
                }
                const narration = await wait(
                    narrate(plan.cuts[index].narration, signal),
                    300000 + plan.cuts[index].narration.length * 60,
                    'Video narration timed out.',
                );
                await mkdir(join(dir, 'out'), { recursive: true, mode: 0o700 });
                await mkdir(join(dir, 'tmp'), { mode: 0o700 });
                const loud = exhibitsOf(index).find((e) => e.sound);
                const timing = await stageNarration(
                    dir,
                    narration,
                    signal,
                    loud && { id: loud.id, seconds: loud.seconds, sentence: loud.sentence },
                );
                cut.timing = {
                    ...timing,
                    audioFrames: timing.durationInFrames,
                    durationInFrames: timing.durationInFrames + CUT_PAUSE_FRAMES,
                    entry: index > 0 ? cutJoin(plan.cuts[index]) : null,
                    // The last cut fades out at the end of the video.
                    exit:
                        index < plan.cuts.length - 1 ? cutJoin(plan.cuts[index + 1]) : cutJoin({}),
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
            // A cut whose engine plays a clip renders it before its audit, which sees frames of the clip; a failed
            // render spends the repair. A crashed cut or a failed audit fix is repaired, then shot again.
            for (;;) {
                while (!engines[index].playable(cut))
                    try {
                        await play(index);
                    } catch (e) {
                        signal.throwIfAborted();
                        if (e.code) throw e;
                        const reason = withoutPaths(e.diagnostic ?? e.message);
                        if (attempts[index] >= CUT_ATTEMPTS)
                            throw cutError(reason, index, plan.cuts.length);
                        await rewrite(index, reason);
                    }
                try {
                    await audit(index);
                    break;
                } catch (e) {
                    if (!e.crashed && !e.repair) throw e;
                    if (attempts[index] >= CUT_ATTEMPTS)
                        throw cutError(e.message, index, plan.cuts.length);
                    await rewrite(index, e.message);
                }
            }
        } catch (error) {
            if (!signal.aborted) {
                cut.status = 'failed';
                persist();
            }
            stop(error);
            // A failed writer may race with audio staging. Drain both before removing private files.
            await Promise.allSettled(operations);
            throw error;
        } finally {
            lastFrames[index].resolve(null);
        }
        cut.status = 'written';
        persist();
    });
    try {
        await Promise.all(writing);
    } catch (error) {
        stop(error);
        await Promise.allSettled(writing);
        // Siblings fail with AbortError once one cut stops the job; report the first real cause.
        throw signal.reason ?? error;
    }
    return { data, attempts, rewrite, stage, persist, play, improving };
}
