import { DISCUSSION_TURN_RULE, discussionTurn } from '../../media/discussion-turn.mjs';
import { tutorContext } from '../../media/diagrams.mjs';

export async function discussionRoutes(req, res, url, ctx, body) {
  const match = url.pathname.match(/^\/api\/trees\/([^/]+)\/discussions\/([^/]+)\/replies$/);
  if (req.method !== 'POST' || !match) return false;
  const [, conversation, id] = match;
  const { store, json, discussing } = ctx;
  const tree = store.tree(conversation),
    data = store.discussion(conversation, id);
  if (!tree || !data) return json(res, 404, { error: 'Discussion not found.' });
  if (data.closed) return json(res, 409, { error: 'This discussion is closed.' });
  if (ctx.active.has(conversation) || discussing.has(id))
    return json(res, 409, { error: 'Wait for the current reply to finish.' });
  if (typeof body?.text !== 'string' || !body.text.trim() || body.text.length > 10000)
    return json(res, 400, { error: 'Enter a discussion reply of at most 10000 characters.' });
  if (!tree.provider) return json(res, 409, { error: 'Choose a chat model in Settings.' });
  const controller = new AbortController(),
    job = { conversation, artifact: id, controller };
  discussing.set(id, job);
  let artifact,
    turn,
    finished = false,
    status = 'streaming',
    raw = '',
    lines = [];
  const items = new Map();
  const send = (data) => {
    if (!res.destroyed && !res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  const finish = (error = null) => {
    if (finished) return;
    finished = true;
    clearInterval(heartbeat);
    controller.signal.removeEventListener('abort', interrupt);
    if (turn) {
      const output = discussionTurn(raw, data.classmates, status === 'completed');
      if (output.error) error ??= output.error;
      const saved = store.updateDiscussion(
        conversation,
        id,
        turn.id,
        lines,
        error ? 'failed' : 'completed',
        error,
      );
      if (saved) {
        if (output.verdicts) store.observe(turn.id, output.verdicts);
        send({ type: 'artifact', artifact: ctx.live(saved) });
      }
    }
    if (!res.headersSent)
      return json(res, 409, { error: error ?? 'The discussion turn was interrupted.' });
    send({ type: 'done' });
    res.end();
  };
  const interrupt = () => finish('The discussion turn was interrupted.');
  const heartbeat = setInterval(() => {
    if (!res.destroyed) res.write(': keepalive\n\n');
  }, 15000);
  controller.signal.addEventListener('abort', interrupt, { once: true });
  job.done = (async () => {
    try {
      artifact = store.replyDiscussion(conversation, id, body.text.trim());
      if (!artifact) throw new Error('This discussion is closed or already responding.');
      const current = JSON.parse(artifact.source);
      turn = current.turn;
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'X-Accel-Buffering': 'no' });
      send({ type: 'artifact', artifact: ctx.live(artifact) });
      if (!tree.model) tree.model = (await ctx.pick(tree).model?.(tree)) ?? null;
      if (tree.effort !== null) {
        const invalid = await ctx.selectionError(tree);
        if (invalid) throw new Error(invalid.error);
      }
      if (finished) return;
      const context = tutorContext({
        ...tree,
        artifacts: tree.artifacts.filter((a) => a.id !== id),
        thread: null,
        working_thread: null,
        instructions: DISCUSSION_TURN_RULE,
        memoryNote: store.memoryNote(),
      });
      const neighbourhood = await ctx.neighbourhood(body.text.trim(), controller.signal);
      if (finished) return;
      const prompt = JSON.stringify({
        discussion: {
          classmates: current.classmates,
          lines: current.lines.map(({ speaker, text }) => ({ speaker, text })),
        },
        neighbourhood,
      });
      await ctx.metered(ctx.pick(tree), 'chat', turn.id, tree).generate(
        context,
        prompt,
        (event) => {
          if (finished) return;
          if (event.type === 'delta' || event.type === 'item') {
            items.set(
              event.item,
              event.type === 'item' ? event.text : (items.get(event.item) ?? '') + event.text,
            );
            raw = [...items.values()].join('\n');
            const output = discussionTurn(raw, current.classmates);
            lines = output.lines;
            const saved = store.updateDiscussion(conversation, id, turn.id, lines);
            if (saved) send({ type: 'artifact', artifact: ctx.live(saved) });
            if (output.error || raw.length > 100000) {
              finish(output.error ?? 'The discussion reply was too long.');
              controller.abort();
            }
          }
          if (event.type === 'status') status = event.status;
        },
        () => {},
        controller.signal,
      );
      if (!finished) {
        if (status === 'streaming') status = 'completed';
        finish(status === 'completed' ? null : 'The discussion turn did not complete.');
      }
    } catch (error) {
      if (!res.headersSent) json(res, 502, { error: error.message });
      finish(error.message);
    }
  })().finally(() => {
    if (discussing.get(id) === job) discussing.delete(id);
  });
  await job.done;
  return true;
}
