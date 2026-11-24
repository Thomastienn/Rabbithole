import { replyArtifacts } from './reply-artifacts.mjs';
import { appCalls, isAppTool } from './app-calls.mjs';
import { markerNotes } from '../media/markers.mjs';
import { diagramReply } from '../media/reply-parser.mjs';
import { ENDED, collectText } from '../providers/chatStream.mjs';

const CLOCK = {
    now: () => performance.now(),
    setTimeout: (run, ms) => setTimeout(run, ms),
    clearTimeout: (timer) => clearTimeout(timer),
};

// One tutor reply from first token to finish: its streamed state, its periodic save and the order of work when it ends.
// It saves through ctx.store and emits events; it does not know HTTP.
export function replyTurn(
    ctx,
    { id, tree, user, reply, body, job, emit, saveEvery, clock = CLOCK },
) {
    const { store } = ctx;
    const { controller } = job;
    const streamed = collectText();
    let text = '',
        status = 'streaming',
        finished = false,
        usage = null,
        called = false,
        questions = [],
        // The tutor's inline notes so far (ADR 0016); the learner sees each one as its marker closes.
        notes = markerNotes('', []),
        // shortcut: a crash mid-reply loses up to saveEvery ms of streamed text; save every delta only if that matters.
        saved = -Infinity,
        // The trailing update for tokens that arrived inside the current interval.
        pending = null,
        // An error from the trailing update; thrown where the provider's errors fail the reply, not out of the timer.
        late = null;
    // Ends the tutor's run once the end section is in and a later model response begins (ADR 0016).
    const run = new AbortController();
    const slots = replyArtifacts(ctx, {
        id,
        tree,
        user,
        reply,
        body,
        emit,
        signal: controller.signal,
    });
    const calls = appCalls(ctx, {
        conversation: id,
        reply,
        showVisual: slots.showVisual,
        makeVideo: slots.makeVideo,
        startDiscussion: slots.startDiscussion,
    });
    const suggesting = store.suggestionSettings().enabled;
    const noted = (output) => {
        const next = markerNotes(output.text, output.markers, slots.hasMedia());
        if (
            suggesting &&
            (next.passages.length > notes.passages.length ||
                next.groundwork.length > notes.groundwork.length)
        )
            emit({
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
            emit({ type: 'questions', questions: (questions = next.questions) });
        notes = next;
    };
    // Parses the text so far and updates the page and the saved row, at most once per saveEvery ms while tokens arrive.
    // A new suggestion can be opened at once, so its brief reads the text saved here.
    const flush = () => {
        clock.clearTimeout(pending);
        pending = null;
        if (finished) return;
        const output = diagramReply(streamed.text('\n\n'));
        text = output.text;
        saved = clock.now();
        store.update(reply, text, status);
        emit({ type: 'text', text });
        noted(output);
        slots.prepare(output);
        calls.place(output);
        calls.runText(output);
    };
    const finish = () => {
        if (finished) return;
        if (pending) flush();
        finished = true;
        slots.end(diagramReply(streamed.text('\n\n'), true), status);
        controller.signal.removeEventListener('abort', interrupt);
        const output = diagramReply(streamed.text('\n\n'), status === 'completed');
        if (output.text !== text) {
            text = output.text;
            emit({ type: 'text', text });
        }
        noted(output);
        calls.place(output);
        if (controller.signal.aborted && !ctx.stopping) slots.cancel();
        for (const tool of store.stopToolCalls(reply)) emit({ type: 'tool', tool });
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
                    context: { ...usage.context, model: store.header(id)?.model ?? tree.model },
                }),
            });
        // History keeps any reported measurement, including failed or stopped calls; unreported ones stay unavailable.
        if (called)
            store.record(
                `chat:${reply}`,
                'chat',
                { provider: tree.provider, model: store.header(id)?.model ?? tree.model },
                usage,
            );
        // Shutdown has stopped the background jobs; the startup run embeds these messages.
        if (!ctx.stopping) ctx.embedMessages();
        if (status === 'completed' || status === 'failed')
            store.finishModel(id, status === 'completed');
        // The verdict judges the learner message, so a retried reply replaces that message's observations.
        if ((status === 'completed' || output.verdicts) && store.live(id)) {
            ctx.jobs.get('verdict', user)?.controller.abort();
            store.observe(user, output.verdicts ?? []);
        }
        // No readable block: the quick thinking model judges the learner message in the background.
        if (status === 'completed' && !output.verdicts && text.trim() && store.live(id))
            ctx.startVerdicts(id, user, body.text, text);
        if (notes.questions.length) store.nextQuestions(reply, notes.questions);
        ctx.noteSuggestions(id, reply, status, notes, body.text, text);
        if (output.requested || output.hidden) store.forgetThread(id);
        ctx.jobs.remove(job);
        emit({ type: 'done', status });
    };
    const interrupt = () => {
        status = 'interrupted';
        finish();
    };
    controller.signal.addEventListener('abort', interrupt, { once: true });
    const onEvent = (event) => {
        if (finished) return;
        if (late) throw late;
        if (streamed.onEvent(event)) {
            const wait = saveEvery - (clock.now() - saved);
            if (wait <= 0) flush();
            else
                pending ??= clock.setTimeout(() => {
                    try {
                        flush();
                    } catch (error) {
                        late = error;
                    }
                }, wait);
        }
        if (event.type === 'response' && pending) flush();
        if (event.type === 'response' && notes.ended) run.abort(ENDED);
        if (event.type === 'status') status = event.status;
        // App tools are machinery, not tool activity.
        if (event.type === 'tool' && !isAppTool(event.tool.name)) {
            if (store.live(id)) store.toolCall(id, reply, event.tool);
            emit({ type: 'tool', tool: event.tool });
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
    };
    return {
        get finished() {
            return finished;
        },
        // Runs the model call with this turn's event handlers, then the work that follows a streamed reply.
        async stream(generate) {
            called = true;
            await generate(
                onEvent,
                (thread, model) => {
                    if (!finished) store.thread(id, thread, model);
                },
                AbortSignal.any([controller.signal, run.signal]),
            );
            if (late) throw late;
            if (pending) flush();
            if (status === 'streaming')
                status = controller.signal.aborted ? 'interrupted' : 'completed';
            if (finished) return;
            const output = diagramReply(streamed.text('\n\n'), true);
            if (status === 'completed') calls.runText(output);
            if (!output.requested) return;
            text = output.text;
            store.update(reply, text, status);
            store.forgetThread(id);
            await slots.draw(output, status);
        },
        // An app tool sees the reply saved up to the call.
        runAppTool(name, input) {
            if (finished) throw new Error('The reply has already ended.');
            if (pending) flush();
            return calls.run(name, input, text.length, text);
        },
        fail(error) {
            if (finished) return;
            status = 'failed';
            emit({
                type: 'error',
                error: error.compaction
                    ? error.message
                    : error.message + ' The last working model selection will be restored.',
            });
        },
        finish,
    };
}
