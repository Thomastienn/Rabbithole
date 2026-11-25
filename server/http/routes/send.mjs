import { nativeTools as nativeToolsFor } from '../../tools/runner.mjs';
import { APP_TOOLS, isAppTool } from '../app-calls.mjs';
import { replyTurn } from '../reply-turn.mjs';
import { tutorContext } from '../../media/tutor-context.mjs';
import { compactionPrompt } from '../jobs/compaction.mjs';
import { withAttachments } from '../../attachments.mjs';
import { attachmentParts, prepareUploads, prepareRetry, savePrepared } from '../attachments.mjs';
import { join } from 'node:path';

// Conversation send and Retry: streams one tutor reply as server-sent events and starts its media jobs.
export async function sendRoute(res, ctx, id, tree, action, body, job) {
    const { store, json, jobs, pick, selectionError, live } = ctx;
    const { controller } = job;
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
            !(jobs.get('compaction', id) && !jobs.get('compaction', id).error)
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
    const compaction = tree.branch && !tree.branch.snapshot ? jobs.get('compaction', id) : null;
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
    // The title job also reads the attachments' extracted text; images without OCR text add nothing.
    if (!retried && !tree.messages.length && !tree.title_renamed)
        ctx.startTitle(
            id,
            body.text,
            prepared
                .flatMap((a) => a.parts.filter((p) => !p.image).map((p) => p.text))
                .join('\n\n')
                .slice(0, 4000),
        );
    const reply = store.message(id, 'assistant', '', 'streaming');
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'X-Accel-Buffering': 'no' });
    const heartbeat = setInterval(() => {
        if (!res.destroyed) res.write(': keepalive\n\n');
    }, 15000);
    const send = (data) => {
        if (!res.destroyed) res.write(`data: ${JSON.stringify(data)}\n\n`);
        if (data.type === 'done') {
            clearInterval(heartbeat);
            res.end();
        }
    };
    const turn = replyTurn(ctx, {
        id,
        tree,
        user,
        reply,
        body,
        job,
        emit: send,
        saveEvery: ctx.saveEvery,
    });
    send({
        type: 'saved',
        id: reply,
        title: store.header(id).title,
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
            if (turn.finished) return true;
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
            if (turn.finished) return true;
            if (compaction.error)
                throw Object.assign(new Error(compaction.error), { compaction: true });
            tree.branch = store.branchOf(id);
        }
        send({ type: 'status', status: 'thinking' });
        if (!tree.model) {
            tree.model = (await pick(tree).model?.(tree)) ?? null;
            if (turn.finished) return true;
            if (tree.model) store.model(id, tree.model);
        }
        if (tree.effort !== null) {
            const invalid = await selectionError(tree);
            if (invalid) throw new Error(invalid.error);
        }
        const capable = await ctx.toolCapable(tree);
        const settings = store.tutorTools();
        const nativeTools = nativeToolsFor({ provider: tree.provider, capable, settings });
        // The app tools are always offered to a tool-capable model, after the learner's tutor tools.
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
        // Attachment text stays out: embedding a long file takes gigabytes of memory.
        const neighbourhood = await ctx.neighbourhood(
            [body.text, tree.branch?.text].filter(Boolean).join('\n'),
            controller.signal,
        );
        if (turn.finished) return true;
        await turn.stream((onEvent, onThread, signal) =>
            ctx.logged(pick(tree), 'chat', reply, tree).generate(
                {
                    ...tutorContext(tree),
                    ...(textTools.length && { textTools }),
                    ...((nativeTools.length || tools.length) && { nativeTools, mcp: ctx.mcp }),
                    ...(tools.length && {
                        tools,
                        runTool: (name, input, signal) =>
                            isAppTool(name)
                                ? turn.runAppTool(name, input)
                                : ctx.tools.run(name, input, { conversation: id, reply, signal }),
                    }),
                    tutorStyle: store.tutorStyle(),
                    memoryNote: store.memoryNote(),
                    neighbourhood,
                    resources: store
                        .resources(id)
                        .slice(-50) // only the newest resources, so a large tree keeps the prompt bounded
                        .reverse()
                        .map(({ number, title, site }) => ({ number, title, site })),
                    ...(images.length && { images }),
                    ...(attachments.some((a) => a.type === 'application/pdf') && { parts }),
                },
                prompt,
                onEvent,
                onThread,
                signal,
            ),
        );
    } catch (error) {
        turn.fail(error);
    } finally {
        try {
            turn.finish();
        } finally {
            // A finish that throws emits no 'done'.
            clearInterval(heartbeat);
        }
    }
    return true;
}
