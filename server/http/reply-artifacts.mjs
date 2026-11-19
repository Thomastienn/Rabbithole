import { LIMITS } from '../media/diagrams.mjs';
import { visualTheme } from '../media/visuals.mjs';
import { asksForVideo } from '../media/videos.mjs';
import { videoContext } from '../tools/makeVideo.mjs';

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
  const videoInput = ({ intent, excerpt }, context) => ({
    ...ctx.videoRoles(tree),
    request: body.text.trim().slice(0, LIMITS.intent),
    intent,
    excerpt,
    ...(context && { context }),
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
  });
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
          ? videoInput(task)
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
  const media = () =>
    [...artifacts.values()].filter((a) => ['visual', 'video', 'discussion'].includes(a.kind));
  // A video stands alone in its reply: a plain error lets the tutor carry on without the extra media.
  const besideVideo = (name) => {
    if (!store.tree(id)) throw new Error('This conversation was deleted.');
    if (media().some((a) => a.kind === 'video'))
      throw new Error(`${name} cannot join a video: a video stands alone in its reply.`);
  };
  const showVisual = (request, position, side = null) => {
    besideVideo('show_visual');
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
      side,
    );
    artifacts.set(`call:${calls++}`, artifact);
    send({ type: 'artifact', artifact: live(artifact) });
    mediaQueue.push(artifact);
    pumpMedia();
  };
  const makeVideo = (topic, position, replySoFar) => {
    besideVideo('make_video');
    if (media().length)
      throw new Error(
        'make_video stands alone: this reply already has a visual or discussion, so make no video in it.',
      );
    if (!asksForVideo(body.text))
      throw new Error(
        'make_video needs the learner to ask for a video or animation explicitly; answer in text instead.',
      );
    if (!ctx.smart().resolved.provider)
      throw new Error('Videos need a smart model; tell the learner to choose one in Settings.');
    const artifact = store.pendingArtifact(
      id,
      reply,
      topic,
      topic,
      'video',
      JSON.stringify(
        videoInput(
          { intent: topic, excerpt: '' },
          videoContext(tree.messages, body.text, replySoFar),
        ),
      ),
      position,
    );
    artifacts.set(`call:${calls++}`, artifact);
    send({ type: 'artifact', artifact: live(artifact) });
    mediaQueue.push(artifact);
    pumpMedia();
  };
  // A start_discussion call: its opening is saved at once, and the learner sees its lines one at a time.
  const startDiscussion = (task, position) => {
    besideVideo('start_discussion');
    const pending = store.pendingArtifact(
      id,
      reply,
      'Discussion',
      '',
      'discussion',
      null,
      position,
    );
    const artifact = store.finishArtifact(id, pending.id, JSON.stringify(task));
    artifacts.set(`call:${calls++}`, artifact);
    send({ type: 'artifact', artifact: live(artifact) });
  };
  return { artifacts, prepareArtifacts, showVisual, makeVideo, startDiscussion };
}
