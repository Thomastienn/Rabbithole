import { LIMITS } from '../media/diagrams.mjs';
import { visualTheme } from '../media/visuals.mjs';
import { asksForVideo } from '../media/videos.mjs';

// One reply owns its artifact slots and the bounded queue for detached media workers.
export function replyArtifacts(
  ctx,
  { id, tree, user, reply, body, send, controller, isFinished, getStatus },
) {
  const { store, live } = ctx;
  const artifacts = new Map(),
    mediaQueue = [];
  let runningMedia = 0;
  // Visuals and videos run detached; Stop cancels them only while the reply streams.
  const pumpMedia = () => {
    while (!ctx.stopping && !controller.signal.aborted && runningMedia < 3 && mediaQueue.length) {
      const artifact = mediaQueue.shift();
      if (store.artifact(id, artifact.id)?.status !== 'pending') continue;
      runningMedia++;
      const start = artifact.kind === 'video' ? ctx.startVideo : ctx.startDrawing;
      start(artifact, controller.signal, (updated) => {
        if (!isFinished()) send({ type: 'artifact', artifact: updated });
      }).done.finally(() => {
        runningMedia--;
        if (!isFinished()) {
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
      if (request.kind === 'discussion') {
        let artifact = artifacts.get(index);
        if (!artifact) {
          artifact = store.pendingArtifact(
            id,
            reply,
            'Discussion',
            '',
            'discussion',
            null,
            request.position,
          );
          artifacts.set(index, artifact);
          send({ type: 'artifact', artifact: live(artifact) });
        }
        if (artifact.status === 'pending' && (request.closed || final)) {
          artifact = store.finishArtifact(
            id,
            artifact.id,
            request.task ? JSON.stringify(request.task) : null,
            request.error ?? (final && !request.closed ? 'Discussion did not complete.' : null),
          );
          artifacts.set(index, artifact);
          send({ type: 'artifact', artifact: live(artifact) });
        }
        continue;
      }
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
      // No smart model (and no chat default to follow): videos are skipped; visuals use the chat model.
      if (request.kind === 'video' && !ctx.smart().resolved.provider) continue;
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
              ...ctx.videoRoles(tree),
              request: body.text.trim().slice(0, LIMITS.intent),
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
                selection: ctx.videoRoles(tree).chat,
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
        (final && getStatus() !== 'completed' ? 'Tutor reply did not complete.' : null) ??
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
  // A show_visual call: pending at the call's reply position and drawing at once while the reply continues.
  let calls = 0;
  const showVisual = (request, position) => {
    if (!store.tree(id)) throw new Error('This conversation was deleted.');
    const earlierTitles = [...artifacts.values()]
      .filter((a) => a.kind === 'visual')
      .map((a) => a.title);
    const artifact = store.pendingArtifact(
      id,
      reply,
      request.title,
      request.alt,
      'visual',
      JSON.stringify({
        selection: ctx.videoRoles(tree).chat,
        theme: visualTheme(body.theme),
        request,
        earlierTitles,
      }),
      position,
    );
    artifacts.set(`call:${calls++}`, artifact);
    send({ type: 'artifact', artifact: live(artifact) });
    mediaQueue.push(artifact);
    pumpMedia();
  };
  return { artifacts, prepareArtifacts, showVisual };
}
