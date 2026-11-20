import { replyArtifacts } from '../reply-artifacts.mjs';
import { nativeTools as nativeToolsFor } from '../../tools/runner.mjs';
import { APP_TOOLS, appCalls, isAppTool } from '../app-calls.mjs';
import { markerNotes } from '../../media/markers.mjs';
import { formatLog, errorCause, privateValues } from '../../log.mjs';
import { diagramReply, generateDiagram, tutorContext } from '../../media/diagrams.mjs';
import { compactionPrompt } from '../jobs/compaction.mjs';
import { withAttachments } from '../../attachments.mjs';
import { attachmentParts, prepareUploads, prepareRetry, savePrepared } from '../attachments.mjs';
import { join } from 'node:path';

// Conversation send and Retry: streams one tutor reply as server-sent events and starts its media jobs.
export async function sendRoute(res, ctx, id, tree, action, body, controller) {
    const { store, json, active, compactions, pick, selectionError, live } = ctx;
    const preparation = {
        // Only a send with files lists the endpoint's models to learn whether this model reads images.
        readsImages: action === 'retry' || body.files?.length ? await ctx.readsImages(tree) : false,
        recognize: ctx.recognize,
    };
    // Retry resends the latest learner message with the current model and effort, replacing the failed reply.
    let retried = null;
    if (action === 'retry') {
        const [question, failed] = tree.messages.slice(-2);
        if (
            failed?.role !== 'assistant' ||
            question?.role !== 'user' ||
            !(
                failed.status === 'failed' ||
                (failed.status === 'interrupted' && failed.stopped === 'shutdown')
            )
        )
            return json(res, 409, {
                error: 'Only the latest failed or interrupted reply can be retried.',
            });
        if (tree.artifacts.some((a) => a.message === failed.id && a.status === 'pending'))
            return json(res, 409, {
                error: 'Wait for this reply’s media to finish, then retry.',
            });
        if (
            tree.artifacts.some(
                (a) =>
                    a.message === failed.id &&
                    a.kind === 'discussion' &&
                    store.discussion(id, a.id)?.lines.some((l) => l.speaker === 'Learner'),
            )
        )
            return json(res, 409, {
                error: 'This reply has discussion messages. Send a new question in the conversation to keep them.',
            });
        // A focused chat whose context preparation failed (or was lost on restart) compacts again before the reply.
        if (
            tree.branch &&
            !tree.branch.snapshot &&
            !(compactions.get(id) && !compactions.get(id).error)
        ) {
            const parent = store.tree(tree.branch.parent);
            if (!parent)
                return json(res, 409, {
                    error: 'This focused chat’s parent is gone, so its context cannot be prepared. Delete it and branch again.',
                });
            const { quick, status, error } = await ctx.quickFor(tree);
            if (error) return json(res, status, { error });
            if (controller.signal.aborted) return json(res, 409, { error: 'Retry cancelled.' });
            ctx.startCompaction(id, compactionPrompt(parent, tree.branch.text), quick);
        }
        let attachments;
        try {
            attachments = await prepareRetry(question.attachments ?? [], ctx.dir, id, preparation);
        } catch (error) {
            return json(res, 400, { error: error.message });
        }
        if (controller.signal.aborted) return json(res, 409, { error: 'Retry cancelled.' });
        savePrepared(attachments, join(ctx.dir, 'attachments', id));
        store.attachmentDelivery(id, attachments);
        store.discardReply(id, failed.id);
        // The provider session may hold the failed turn; a fresh session receives the saved discussion instead.
        store.forgetThread(id);
        Object.assign(tree, {
            messages: tree.messages.slice(0, -2),
            thread: null,
            working_thread: null,
        });
        retried = { user: question.id, replaced: failed.id, attachments };
        body = { text: question.text, theme: body.theme };
    }
    if (['artifactId', 'artifactIds', 'artifacts'].some((key) => Object.hasOwn(body, key)))
        return json(res, 400, {
            error: 'Diagrams are attached by the server to their originating reply.',
        });
    const files = body.files ?? [];
    if (!Array.isArray(files) || files.some((f) => !(f instanceof File)))
        return json(res, 400, { error: 'Invalid request.' });
    if (
        typeof body.text !== 'string' ||
        (!body.text.trim() && !files.length && !retried?.attachments.length)
    )
        return json(res, 400, { error: 'Enter a question.' });
    if (!tree.provider)
        return json(res, 409, {
            error: 'Choose a chat model in Settings.',
            code: 'chat_model_unset',
        });
    const compaction = tree.branch && !tree.branch.snapshot ? compactions.get(id) : null;
    if (
        tree.branch &&
        !tree.branch.snapshot &&
        (!compaction || (compaction.error && !retried && tree.messages.length))
    )
        return json(res, 409, {
            error: 'This focused chat’s context was not prepared. Retry its reply to prepare it again.',
        });
    // Every file is prepared before anything is saved, so an unsupported one refuses the whole send.
    let prepared;
    try {
        prepared = await prepareUploads(files, preparation);
    } catch (error) {
        return json(res, 400, { error: error.message });
    }
    if (controller.signal.aborted) return json(res, 409, { error: 'Send cancelled.' });
    savePrepared(prepared, join(ctx.dir, 'attachments', id));
    const attachments = retried?.attachments ?? prepared;
    const prompt = withAttachments(body.text, attachments);
    const parts = attachmentParts(body.text, attachments, join(ctx.dir, 'attachments', id));
    // Only this turn's images go to the model as images; history keeps their [image: name] text.
    const images = parts.filter((p) => p.image).map((p) => p.image);
    const user =
        retried?.user ??
        store.message(
            id,
            'user',
            body.text,
            'completed',
            body.text.trim() ? body.text : prepared.map((a) => a.name).join(', '),
        );
    if (!retried) store.attach(id, user, prepared);
    // The placeholder title shows at once; quick thinking may replace it while the title is unrenamed.
    // An attachment-only question titles from the attachments' text, which starts with each file name.
    if (!retried && !tree.messages.length && !tree.title_renamed)
        ctx.startTitle(id, body.text.trim() ? body.text : prompt.slice(0, 4000));
    const reply = store.message(id, 'assistant', '', 'streaming');
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'X-Accel-Buffering': 'no' });
    const send = (data) => {
        if (!res.destroyed) res.write(`data: ${JSON.stringify(data)}\n\n`);
    };
    const items = new Map();
    let text = '',
        status = 'streaming',
        finished = false,
        usage = null,
        called = false,
        questions = [],
        // The tutor's inline notes so far (ADR 0016); the learner sees each one as its marker closes.
        notes = markerNotes('', []),
        // shortcut: a crash mid-reply loses up to ctx.saveEvery ms of streamed text; save every delta only if that matters.
        saved = -Infinity;
    const heartbeat = setInterval(() => {
        if (!res.destroyed) res.write(': keepalive\n\n');
    }, 15000);
    const {
        artifacts,
        prepareArtifacts,
        showVisual,
        moveVisual,
        makeVideo,
        startDiscussion,
        hasMedia,
    } = replyArtifacts(ctx, {
        id,
        tree,
        user,
        reply,
        body,
        send,
        controller,
        isFinished: () => finished,
        getStatus: () => status,
    });
    const calls = appCalls(ctx, { reply, showVisual, moveVisual, makeVideo, startDiscussion });
    const suggesting = store.suggestionSettings().enabled;
    const noted = (output) => {
        const next = markerNotes(output.text, output.markers, hasMedia());
        if (
            suggesting &&
            (next.passages.length > notes.passages.length ||
                next.groundwork.length > notes.groundwork.length)
        )
            send({
                type: 'suggestions',
                suggestions: {
                    message: reply,
                    status: 'pending',
                    passages: next.passages,
                    groundwork: next.groundwork,
                },
            });
        // Each next question shows once its marker closes.
        if (next.questions.length > questions.length)
            send({ type: 'questions', questions: (questions = next.questions) });
        notes = next;
    };
    const finish = () => {
        if (finished) return;
        finished = true;
        prepareArtifacts(diagramReply([...items.values()].join('\n\n'), true), true);
        clearInterval(heartbeat);
        controller.signal.removeEventListener('abort', interrupt);
        const output = diagramReply([...items.values()].join('\n\n'), status === 'completed');
        if (output.text !== text) {
            text = output.text;
            send({ type: 'text', text });
        }
        noted(output);
        if (controller.signal.aborted && !ctx.stopping) {
            store.cancelVisuals(id, reply);
            for (const artifact of artifacts.values())
                if (['visual', 'video'].includes(artifact.kind)) {
                    if (artifact.kind === 'video') store.cancelVideo(id, artifact.id);
                    const current = store.artifact(id, artifact.id);
                    if (current) send({ type: 'artifact', artifact: live(current) });
                }
        }
        for (const tool of store.stopToolCalls(reply)) send({ type: 'tool', tool });
        for (const artifact of artifacts.values())
            if (
                artifact.kind === 'mermaid' &&
                store.artifact(id, artifact.id)?.status === 'pending'
            )
                store.finishArtifact(id, artifact.id, null, 'Diagram generation cancelled.');
        store.update(
            reply,
            text,
            status,
            status === 'interrupted'
                ? ctx.stopping
                    ? 'shutdown'
                    : controller.signal.aborted
                      ? 'learner'
                      : null
                : null,
        );
        // Provider-reported counts only; failed, partial and canceled replies keep no usage.
        if (
            usage &&
            !['input', 'output', 'cacheRead'].every(
                (k) => Number.isSafeInteger(usage[k]) && usage[k] >= 0,
            )
        )
            usage = null;
        if (status === 'completed' && usage)
            store.usage(reply, {
                ...usage,
                ...(usage.context && {
                    context: { ...usage.context, model: store.tree(id)?.model ?? tree.model },
                }),
            });
        // History keeps any reported measurement, including failed or stopped calls; unreported ones stay unavailable.
        if (called)
            store.record(
                `chat:${reply}`,
                'chat',
                { provider: tree.provider, model: store.tree(id)?.model ?? tree.model },
                usage,
            );
        if (status === 'completed' || status === 'failed')
            store.finishModel(id, status === 'completed');
        // The verdict judges the learner message, so a retried reply replaces that message's observations.
        if ((status === 'completed' || output.verdicts) && store.tree(id)) {
            ctx.verdicting.get(user)?.controller.abort();
            store.observe(user, output.verdicts ?? []);
        }
        // No readable block: the quick thinking model judges the learner message in the background.
        if (status === 'completed' && !output.verdicts && text.trim() && store.tree(id))
            ctx.startVerdicts(id, user, body.text, text);
        if (notes.questions.length) store.nextQuestions(reply, notes.questions);
        ctx.noteSuggestions(id, reply, status, notes, body.text, text);
        if (output.requested || output.hidden) store.forgetThread(id);
        if (active.get(id) === controller) active.delete(id);
        send({ type: 'done', status });
        res.end();
    };
    const interrupt = () => {
        status = 'interrupted';
        finish();
    };
    controller.signal.addEventListener('abort', interrupt, { once: true });
    send({
        type: 'saved',
        id: reply,
        title: store.tree(id).title,
        user: {
            id: user,
            role: 'user',
            text: body.text,
            status: 'completed',
            ...(attachments.length && {
                attachments: attachments.map(({ text, bytes, parts, ...a }) => a),
            }),
        },
        ...(retried && { replaced: retried.replaced }),
    });
    try {
        const closed = ctx.closeDiscussions(id);
        for (const artifact of closed) send({ type: 'artifact', artifact: live(artifact) });
        if (closed.length) {
            tree.thread = null;
            tree.working_thread = null;
        }
        if (
            store
                .tree(id)
                .artifacts.some(
                    (a) =>
                        a.kind === 'discussion' &&
                        store.discussion(id, a.id)?.closed &&
                        !store.discussion(id, a.id).summary,
                )
        ) {
            send({ type: 'status', status: 'compacting' });
            try {
                await ctx.compactDiscussions(tree, controller, send);
            } catch (error) {
                throw Object.assign(error, { compaction: true });
            }
            if (finished) return true;
        }
        // The child's first reply waits for its inherited context; the stream shows each phase.
        if (compaction) {
            send({ type: 'status', status: 'compacting' });
            await Promise.race([
                compaction.done,
                new Promise((resolve) =>
                    controller.signal.addEventListener('abort', resolve, { once: true }),
                ),
            ]);
            if (finished) return true;
            if (compaction.error)
                throw Object.assign(new Error(compaction.error), { compaction: true });
            tree.branch = store.tree(id).branch;
        }
        send({ type: 'status', status: 'thinking' });
        if (!tree.model) {
            tree.model = (await pick(tree).model?.(tree)) ?? null;
            if (finished) return true;
            if (tree.model) store.model(id, tree.model);
        }
        if (tree.effort !== null) {
            const invalid = await selectionError(tree);
            if (invalid) throw new Error(invalid.error);
        }
        const capable = await ctx.toolCapable(tree);
        const settings = store.tutorTools();
        const nativeTools = nativeToolsFor({ provider: tree.provider, capable, settings });
        // show_visual is always offered to a tool-capable model, after the learner's tutor tools.
        const tools = [
            ...(await ctx.tools.tools({
                provider: tree.provider,
                capable,
                settings,
                signal: controller.signal,
            })),
            ...(capable ? APP_TOOLS : []),
        ];
        // Without native tool calling the tutor writes app tool calls as <tool_call> text.
        const textTools = capable ? [] : APP_TOOLS;
        const neighbourhood = await ctx.neighbourhood(
            [prompt, tree.branch?.text].filter(Boolean).join('\n'),
            controller.signal,
        );
        if (finished) return true;
        called = true;
        await ctx.logged(pick(tree), 'chat', reply, tree).generate(
            {
                ...tutorContext(tree),
                ...(textTools.length && { textTools }),
                ...((nativeTools.length || tools.length) && { nativeTools, mcp: ctx.mcp }),
                ...(tools.length && {
                    tools,
                    runTool: (name, input, signal) => {
                        if (!isAppTool(name))
                            return ctx.tools.run(name, input, { conversation: id, reply, signal });
                        if (finished) throw new Error('The reply has already ended.');
                        return calls.run(name, input, text.length, text);
                    },
                }),
                tutorStyle: store.tutorStyle(),
                memoryNote: store.memoryNote(),
                neighbourhood,
                resources: store
                    .resources(id)
                    .map(({ number, title, site }) => ({ number, title, site })),
                ...(images.length && { images }),
                ...(attachments.some((a) => a.type === 'application/pdf') && { parts }),
            },
            prompt,
            (event) => {
                if (finished) return;
                if (event.type === 'delta' || event.type === 'item') {
                    items.set(
                        event.item,
                        event.type === 'item'
                            ? event.text
                            : (items.get(event.item) ?? '') + event.text,
                    );
                    const output = diagramReply([...items.values()].join('\n\n'));
                    text = output.text;
                    if (performance.now() - saved >= ctx.saveEvery) {
                        saved = performance.now();
                        store.update(reply, text, status);
                    }
                    send({ type: 'text', text });
                    noted(output);
                    prepareArtifacts(output);
                    calls.place(output);
                    calls.runText(output);
                }
                if (event.type === 'status') status = event.status;
                // App tools are machinery, not tool activity.
                if (event.type === 'tool' && !isAppTool(event.tool.name)) {
                    if (store.tree(id)) store.toolCall(id, reply, event.tool);
                    send({ type: 'tool', tool: event.tool });
                }
                if (event.type === 'usage')
                    usage = {
                        input: event.usage.input,
                        output: event.usage.output,
                        cacheRead: event.usage.cacheRead,
                        reasoning: event.usage.reasoning,
                        ...(Number.isSafeInteger(event.usage.contextWindow) &&
                            event.usage.contextWindow > 0 && {
                                context: {
                                    limit: event.usage.contextWindow,
                                    provider: tree.provider,
                                },
                            }),
                    };
            },
            (thread, model) => {
                if (!finished) store.thread(id, thread, model);
            },
            controller.signal,
        );
        if (status === 'streaming')
            status = controller.signal.aborted ? 'interrupted' : 'completed';
        if (!finished) {
            const output = diagramReply([...items.values()].join('\n\n'), true);
            if (status === 'completed') calls.runText(output);
            if (output.requested) {
                text = output.text;
                store.update(reply, text, status);
                store.forgetThread(id);
                prepareArtifacts(output, true);
                // Legacy diagrams run in reply order; visuals and videos already run detached.
                for (let artifact of artifacts.values()) {
                    if (finished) break;
                    if (artifact.status !== 'pending' || artifact.kind !== 'mermaid') continue;
                    ctx.log(
                        formatLog('info', 'media', 'started', { id: artifact.id, task: 'diagram' }),
                    );
                    try {
                        const selection = { provider: tree.provider, model: store.tree(id).model };
                        const source = await generateDiagram(
                            ctx.metered(pick(tree), 'diagram', artifact.id, selection, {
                                message: artifact.message,
                            }),
                            selection,
                            JSON.parse(artifact.input),
                            controller.signal,
                            ctx.diagramTimeout,
                            ctx.diagramParse,
                        );
                        if (!finished) {
                            artifact = store.finishArtifact(id, artifact.id, source);
                            ctx.log(
                                formatLog('info', 'media', 'saved', {
                                    id: artifact.id,
                                    task: 'diagram',
                                }),
                            );
                        }
                    } catch (error) {
                        ctx.log(
                            formatLog(
                                controller.signal.aborted ? 'info' : 'error',
                                'media',
                                controller.signal.aborted ? 'stopped' : 'failed',
                                {
                                    id: artifact.id,
                                    task: 'diagram',
                                    ...(!controller.signal.aborted && {
                                        cause: errorCause(error, privateValues(artifact.input)),
                                        next: 'Check the selected model, then Retry the diagram.',
                                    }),
                                },
                            ),
                        );
                        if (!finished)
                            artifact = store.finishArtifact(id, artifact.id, null, error.message);
                    }
                    if (!finished) send({ type: 'artifact', artifact: live(artifact) });
                }
            }
        }
    } catch (error) {
        if (!finished) {
            status = 'failed';
            send({
                type: 'error',
                error: error.compaction
                    ? error.message
                    : error.message + ' The last working model selection will be restored.',
            });
        }
    } finally {
        finish();
    }
    return true;
}
