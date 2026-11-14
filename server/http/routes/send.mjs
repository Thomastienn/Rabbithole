import { formatLog, errorCause, privateValues } from '../../log.mjs';
import { diagramReply, generateDiagram, LIMITS, tutorContext } from '../../media/diagrams.mjs';
import { visualTheme } from '../../media/visuals.mjs';
import { asksForVideo } from '../../media/videos.mjs';
import { compactionPrompt } from '../jobs/compaction.mjs';
import { withAttachments } from '../../attachments.mjs';
import { prepareUploads, prepareRetry } from '../attachments.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Conversation send and Retry: streams one tutor reply as server-sent events and starts its media jobs.
export async function sendRoute(res, ctx, id, tree, action, body, controller) {
  const { store, json, active, compactions, pick, selectionError, live } = ctx;
  const preparation = {
    readsImages: !!ctx.providers[tree.provider]?.readsImages,
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
    // A focused chat whose context preparation failed (or was lost on restart) compacts again before the reply.
    if (
      tree.branch &&
      !tree.branch.snapshot &&
      !(compactions.get(id) && !compactions.get(id).error)
    ) {
      const parent = store.tree(tree.branch.parent);
      if (!parent)
        return json(res, 409, {
          error:
            'This focused chat’s parent is gone, so its context cannot be prepared. Delete it and branch again.',
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
    return json(res, 409, { error: 'Choose a chat model in Settings.', code: 'chat_model_unset' });
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
  if (prepared.length) {
    const folder = join(ctx.dir, 'attachments', id);
    mkdirSync(folder, { recursive: true, mode: 0o700 });
    for (const a of prepared) writeFileSync(join(folder, a.id), a.bytes, { mode: 0o600 });
  }
  const attachments = retried?.attachments ?? prepared;
  const prompt = withAttachments(body.text, attachments);
  // Only this turn's images go to the model as images; history keeps their [image: name] text.
  const images = attachments
    .filter((a) => a.delivery === 'image')
    .map((a) => ({ name: a.name, type: a.type, path: join(ctx.dir, 'attachments', id, a.id) }));
  const user =
    retried?.user ??
    store.message(
      id,
      'user',
      body.text,
      'completed',
      body.text.trim() ? body.text : prepared.map((a) => a.name).join(', '),
    );
  if (!retried) {
    store.attach(id, user, prepared);
    store.questionEvidence(id, body.text, user);
  }
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
    called = false;
  const artifacts = new Map(),
    mediaQueue = [];
  let runningMedia = 0;
  const heartbeat = setInterval(() => {
    if (!res.destroyed) res.write(': keepalive\n\n');
  }, 15000);
  // Visuals and videos run detached; Stop cancels them only while the reply streams.
  const pumpMedia = () => {
    while (!ctx.stopping && !controller.signal.aborted && runningMedia < 3 && mediaQueue.length) {
      const artifact = mediaQueue.shift();
      if (store.artifact(id, artifact.id)?.status !== 'pending') continue;
      runningMedia++;
      const start = artifact.kind === 'video' ? ctx.startVideo : ctx.startDrawing;
      start(artifact, controller.signal, (updated) => {
        if (!finished) send({ type: 'artifact', artifact: updated });
      }).done.finally(() => {
        runningMedia--;
        if (!finished) {
          const current = store.artifact(id, artifact.id);
          if (current) send({ type: 'artifact', artifact: live(current) });
        }
        pumpMedia();
      });
    }
  };
  // Legacy diagrams retain their completed-reply policy.
  const prepareArtifacts = (output, final = false) => {
    if (!store.tree(id)) return;
    for (const [index, request] of (output.requests ?? []).entries()) {
      if (
        !final &&
        (!request.closed ||
          (request.kind !== 'visual' && (request.kind !== 'video' || request.error)))
      )
        continue;
      if (artifacts.has(index)) {
        const artifact = artifacts.get(index);
        if (
          request.error &&
          artifact.kind === 'video' &&
          store.artifact(id, artifact.id)?.status === 'pending'
        ) {
          const failed = store.finishVideo(id, artifact.id, artifact.attempt, {}, request.error);
          ctx.videos.get(artifact.id)?.controller.abort(new Error(request.error));
          artifacts.set(index, failed);
          send({ type: 'artifact', artifact: live(failed) });
        }
        continue;
      }
      // No smart model (and no chat default to follow): visuals and videos are skipped, the reply still arrives.
      if (['visual', 'video'].includes(request.kind) && !ctx.smart().resolved.provider) continue;
      const label =
        request.kind === 'video' ? 'Video' : request.kind === 'visual' ? 'Visual' : 'Diagram';
      const task = request.task ?? {
        title: label,
        description: `The tutor’s ${label.toLowerCase()} request could not be read.`,
        intent: body.text.trim().slice(0, LIMITS.intent),
        excerpt: '',
        ...request.partial,
      };
      const input =
        request.kind === 'video'
          ? {
              selection: ctx.smart().resolved,
              request: body.text,
              intent: task.intent,
              excerpt: task.excerpt,
              inheritedContext: tree.branch
                ? {
                    snapshot: tree.branch.snapshot,
                    selectedPassage: tree.branch.text,
                    question: tree.branch.question,
                  }
                : null,
              sources: {
                conversation: id,
                requestMessage: user,
                replyMessage: reply,
                ...(tree.branch && {
                  parentConversation: tree.branch.parent,
                  parentMessage: tree.branch.messageId,
                }),
              },
            }
          : request.kind === 'visual'
            ? {
                selection: ctx.smart().resolved,
                theme: visualTheme(body.theme),
                request: task,
                earlierTitles: output.requests
                  .slice(0, index)
                  .filter((r) => r.kind === 'visual')
                  .map((r) => (r.task ?? r.partial)?.title ?? 'Visual'),
              }
            : task;
      let artifact = store.pendingArtifact(
        id,
        reply,
        task.title,
        task.description,
        request.kind,
        JSON.stringify(input),
        request.position,
      );
      const invalid =
        request.error ??
        (final && status !== 'completed' ? 'Tutor reply did not complete.' : null) ??
        (request.kind === 'video' && !asksForVideo(body.text)
          ? 'Video request could not be read: the learner did not ask for a video. Retry to create it.'
          : null);
      if (invalid)
        artifact =
          request.kind === 'video'
            ? store.finishVideo(id, artifact.id, artifact.attempt, {}, invalid)
            : store.finishArtifact(id, artifact.id, null, invalid);
      artifacts.set(index, artifact);
      send({ type: 'artifact', artifact: live(artifact) });
      if (['visual', 'video'].includes(artifact.kind) && artifact.status === 'pending')
        mediaQueue.push(artifact);
    }
    pumpMedia();
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
    if (controller.signal.aborted && !ctx.stopping) {
      store.cancelVisuals(id, reply);
      for (const artifact of artifacts.values())
        if (['visual', 'video'].includes(artifact.kind)) {
          if (artifact.kind === 'video') store.cancelVideo(id, artifact.id);
          const current = store.artifact(id, artifact.id);
          if (current) send({ type: 'artifact', artifact: live(current) });
        }
    }
    for (const artifact of artifacts.values())
      if (artifact.kind === 'mermaid' && store.artifact(id, artifact.id)?.status === 'pending')
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
    if (status === 'completed' && text.trim()) ctx.startSuggestions(id, reply, body.text, text);
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
      ...(attachments.length && { attachments: attachments.map(({ text, bytes, ...a }) => a) }),
    },
    ...(retried && { replaced: retried.replaced }),
  });
  try {
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
      if (compaction.error) throw Object.assign(new Error(compaction.error), { compaction: true });
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
    called = true;
    await ctx.logged(pick(tree), 'chat', reply, tree).generate(
      { ...tutorContext(tree), tutorStyle: store.tutorStyle(), ...(images.length && { images }) },
      prompt,
      (event) => {
        if (finished) return;
        if (event.type === 'delta' || event.type === 'item') {
          items.set(
            event.item,
            event.type === 'item' ? event.text : (items.get(event.item) ?? '') + event.text,
          );
          const output = diagramReply([...items.values()].join('\n\n'));
          text = output.text;
          store.update(reply, text, status);
          send({ type: 'text', text });
          prepareArtifacts(output);
        }
        if (event.type === 'status') status = event.status;
        if (event.type === 'usage')
          usage = {
            input: event.usage.input,
            output: event.usage.output,
            cacheRead: event.usage.cacheRead,
            ...(Number.isSafeInteger(event.usage.contextWindow) &&
              event.usage.contextWindow > 0 && {
                context: { limit: event.usage.contextWindow, provider: tree.provider },
              }),
          };
      },
      (thread, model) => {
        if (!finished) store.thread(id, thread, model);
      },
      controller.signal,
    );
    if (status === 'streaming') status = controller.signal.aborted ? 'interrupted' : 'completed';
    if (!finished) {
      const output = diagramReply([...items.values()].join('\n\n'), true);
      if (output.requested) {
        text = output.text;
        store.update(reply, text, status);
        store.forgetThread(id);
        prepareArtifacts(output, true);
        // Legacy diagrams run in reply order; visuals and videos already run detached.
        for (let artifact of artifacts.values()) {
          if (finished) break;
          if (artifact.status !== 'pending' || artifact.kind !== 'mermaid') continue;
          ctx.log(formatLog('info', 'media', 'started', { id: artifact.id, task: 'diagram' }));
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
              ctx.log(formatLog('info', 'media', 'saved', { id: artifact.id, task: 'diagram' }));
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
            if (!finished) artifact = store.finishArtifact(id, artifact.id, null, error.message);
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
