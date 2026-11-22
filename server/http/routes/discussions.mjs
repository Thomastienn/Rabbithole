import { DISCUSSION_TURN_RULE, discussionTurn } from '../../media/discussion-turn.mjs';
import { tutorContext } from '../../media/diagrams.mjs';
import { collectText } from '../../providers/chatStream.mjs';

export async function discussionRoutes(req, res, url, ctx, body) {
    const match = url.pathname.match(/^\/api\/trees\/([^/]+)\/discussions\/([^/]+)\/replies$/);
    if (req.method !== 'POST' || !match) return false;
    const [, conversation, id] = match;
    const { store, json } = ctx;
    const tree = store.tree(conversation),
        data = store.discussion(conversation, id);
    if (!tree || !data) return json(res, 404, { error: 'Discussion not found.' });
    if (data.closed) return json(res, 409, { error: 'This discussion is closed.' });
    if (ctx.jobs.get('reply', conversation) || ctx.jobs.get('discussion', id))
        return json(res, 409, { error: 'Wait for the current reply to finish.' });
    if (typeof body?.text !== 'string' || !body.text.trim() || body.text.length > 10000)
        return json(res, 400, { error: 'Enter a discussion reply of at most 10000 characters.' });
    if (!tree.provider) return json(res, 409, { error: 'Choose a chat model in Settings.' });
    const controller = new AbortController();
    let artifact,
        turn,
        finished = false,
        status = 'streaming',
        raw = '',
        lines = [],
        // shortcut: a crash mid-turn loses up to ctx.saveEvery ms of streamed lines, like the main reply.
        saved = -Infinity,
        // The trailing save for tokens that arrived inside the current interval.
        pending = null,
        // An error from the trailing save; thrown where the provider's errors fail the turn, not out of the timer.
        late = null;
    const streamed = collectText();
    const send = (data) => {
        if (!res.destroyed && !res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`);
    };
    // Parses the text so far and saves and sends the turn, at most once per ctx.saveEvery ms while tokens arrive.
    const flush = () => {
        clearTimeout(pending);
        pending = null;
        if (finished) return;
        raw = streamed.text('\n');
        const output = discussionTurn(raw, data.classmates);
        lines = output.lines;
        saved = performance.now();
        const row = store.updateDiscussion(conversation, id, turn.id, lines);
        if (row) send({ type: 'artifact', artifact: ctx.live(row) });
        if (output.error || raw.length > 100000) {
            finish(output.error ?? 'The discussion reply was too long.');
            controller.abort();
        }
    };
    const finish = (error = null) => {
        if (finished) return;
        finished = true;
        clearTimeout(pending);
        clearInterval(heartbeat);
        controller.signal.removeEventListener('abort', interrupt);
        if (turn) {
            // Tokens since the last save are only in streamed.
            raw = streamed.text('\n');
            lines = discussionTurn(raw, data.classmates).lines;
            const output = discussionTurn(raw, data.classmates, status === 'completed');
            if (output.error) error ??= output.error;
            const row = store.updateDiscussion(
                conversation,
                id,
                turn.id,
                lines,
                error ? 'failed' : 'completed',
                error,
            );
            if (row) {
                if (output.verdicts) store.observe(turn.id, output.verdicts);
                send({ type: 'artifact', artifact: ctx.live(row) });
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
    const job = ctx.jobs.start(
        'discussion',
        id,
        conversation,
        async () => {
            try {
                artifact = store.replyDiscussion(conversation, id, body.text.trim());
                if (!artifact) throw new Error('This discussion is closed or already responding.');
                const current = JSON.parse(artifact.source);
                turn = current.turn;
                res.writeHead(200, {
                    'Content-Type': 'text/event-stream',
                    'X-Accel-Buffering': 'no',
                });
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
                        if (late) throw late;
                        if (streamed.onEvent(event)) {
                            const wait = ctx.saveEvery - (performance.now() - saved);
                            if (wait <= 0) flush();
                            else
                                pending ??= setTimeout(() => {
                                    try {
                                        flush();
                                    } catch (error) {
                                        late = error;
                                    }
                                }, wait);
                        }
                        if (event.type === 'status') status = event.status;
                    },
                    () => {},
                    controller.signal,
                );
                if (late) throw late;
                if (!finished) {
                    if (status === 'streaming') status = 'completed';
                    finish(status === 'completed' ? null : 'The discussion turn did not complete.');
                }
            } catch (error) {
                if (!res.headersSent) json(res, 502, { error: error.message });
                finish(error.message);
            }
        },
        { controller },
    );
    job.artifact = id;
    await job.done;
    return true;
}
