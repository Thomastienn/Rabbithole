import { formatLog, errorCause } from '../log.mjs';
import { validUsage } from '../store/usage.mjs';
import { sentenceReader } from './script.mjs';
import { boardSystem } from './prompt.mjs';
import { conversationHistory } from '../providers/conversationHistory.mjs';

const STOPPED = 'The tutor stopped. Ask again to carry on.';

// One board session per open board: the conversation's own model process, its turns and their saving.
// Up: { type: 'ask', text }, { type: 'progress', sentence, phase: 'start' | 'end' } as each caption shows and ends, { type: 'leave' }.
// Down: { type: 'state', state: 'idle' | 'thinking' | 'speaking' }, { type: 'sentence', id, text }, { type: 'notice', notice }.
export function boardSession(ctx, id, socket) {
    const { store, log } = ctx;
    const send = (event) => {
        if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(event));
    };
    let process = null,
        model,
        warmedFor,
        turn = null,
        closed = false,
        count = 0;
    const ended = Promise.withResolvers();
    // A newer board for the same conversation replaces this one; deleting it or stopping the app ends it too.
    ctx.jobs.get('board', id)?.controller.abort();
    const session = ctx.jobs.start(
        'board',
        id,
        id,
        (job) => {
            job.controller.signal.addEventListener('abort', () => close(), { once: true });
            return ended.promise;
        },
        { settle: false },
    );
    const providerFor = (tree) =>
        Object.hasOwn(ctx.providers, tree.provider ?? '') ? ctx.providers[tree.provider] : null;
    const version = (tree) =>
        JSON.stringify([tree.provider, tree.model, tree.thread, tree.messages.at(-1)?.id]);
    const warm = async (tree, signal) => {
        const key = version(tree);
        if (process && warmedFor === key) return;
        process?.close();
        process = null;
        const provider = providerFor(tree);
        if (!provider?.board || signal.aborted) return;
        const learner = tree.messages.filter((m) => m.role === 'user').slice(-2);
        const neighbourhood = await ctx
            .neighbourhood(
                [tree.title, tree.branch?.text, ...learner.map((m) => m.text)]
                    .filter(Boolean)
                    .join('\n'),
                signal,
            )
            .catch(() => null);
        model = tree.model ?? (await provider.model?.(tree)) ?? null;
        if (closed || signal.aborted) return;
        process = provider.board({
            model,
            thread: tree.thread,
            system: boardSystem({
                ...tree,
                tutorStyle: store.tutorStyle(),
                memoryNote: store.memoryNote(),
                neighbourhood,
            }),
            history: conversationHistory(tree),
        });
        process.open();
        warmedFor = key;
    };
    // A board opened during a chat reply warms from the saved tree once that reply settles.
    const signal = session.controller.signal;
    const active = ctx.jobs.get('reply', id);
    const ready = (active?.done ?? Promise.resolve())
        .catch(() => {})
        .then(() => !closed && warm(store.tree(id), signal))
        .catch(() => {}); // Retry a failed warm-up on the first question.
    const unavailable = () =>
        send({
            type: 'notice',
            notice: 'The board needs a Claude or Codex chat model for now. Choose one for this conversation, then open the board again.',
        });
    if (!providerFor(store.header(id))?.board) unavailable();
    const shownText = (current) =>
        current.sentences
            .slice(0, current.shown)
            .map((s) => s.text)
            .join('\n');
    // Saves the reply with every sentence that started showing; the rest is dropped.
    const finish = (current, status) => {
        if (current.done) return;
        current.done = true;
        const stopped = status === 'interrupted' ? (ctx.stopping ? 'shutdown' : 'learner') : null;
        store.update(current.reply, shownText(current), status, stopped);
        if (status === 'completed' && current.usage && validUsage(current.usage))
            store.usage(current.reply, {
                input: current.usage.input,
                output: current.usage.output,
                cacheRead: current.usage.cacheRead,
                reasoning: current.usage.thinking,
            });
        if (status === 'completed') {
            store.thread(id, process.thread, model);
            store.finishModel(id, true);
            warmedFor = version(store.tree(id));
        } else if (current.sentences.length) {
            // Claude may have stored text the learner never saw. Replay the saved discussion next time.
            store.forgetThread(id);
        }
        if (turn === current) turn = null;
        ctx.jobs.remove(current.job);
        current.ended.resolve();
        send({ type: 'state', state: 'idle' });
    };
    const run = async (current, tree, text, signal) => {
        const started = performance.now();
        const reader = sentenceReader();
        const add = (texts) => {
            if (current.done) return;
            for (const text of texts) {
                const sentence = { id: String(++count), text };
                current.sentences.push(sentence);
                if (current.sentences.length === 1) send({ type: 'state', state: 'speaking' });
                send({ type: 'sentence', ...sentence });
            }
        };
        let result;
        try {
            await ready;
            if (!signal.aborted) await warm(tree, signal);
            result = signal.aborted
                ? { status: 'interrupted' }
                : await process.ask(text, (e) => add(reader.feed(e.text)), signal);
        } catch (error) {
            result = { status: 'failed', cause: error };
        }
        if (result.status === 'completed') add(reader.end());
        const usage = result.usage;
        const status = signal.aborted ? 'interrupted' : result.status;
        const failed = status === 'failed' || (status === 'completed' && !current.sentences.length);
        // Thinking above 0 is a latency regression to investigate (docs/board-spec.md).
        log(
            formatLog(
                failed ? 'error' : 'info',
                'model',
                failed ? 'failed' : status === 'interrupted' ? 'interrupted' : 'finished',
                {
                    id: current.reply,
                    task: 'board',
                    provider: tree.provider,
                    model,
                    input: usage?.input,
                    output: usage?.output,
                    cacheRead: usage?.cacheRead,
                    thinking: usage?.thinking,
                    ms: Math.round(performance.now() - started),
                    ...(failed && {
                        cause: errorCause(
                            result.cause ?? result.error ?? 'Provider reported a failed call.',
                            [text],
                        ),
                        next: 'Check provider sign-in, then ask again.',
                    }),
                },
            ),
        );
        if (current.done) return;
        current.usage = usage;
        if (status === 'completed' && !failed) {
            current.generated = true;
            return settle(current);
        }
        if (status === 'interrupted') return finish(current, 'interrupted');
        send({ type: 'notice', notice: result.error ?? STOPPED });
        finish(current, 'failed');
    };
    const ask = (text) => {
        // A question waits for the tutor to finish; cutting in comes with interruptions.
        if (turn || closed) return;
        const tree = store.tree(id);
        const supported = providerFor(tree)?.board;
        if (!supported || ctx.jobs.get('reply', id)) {
            if (!supported) unavailable();
            else
                send({
                    type: 'notice',
                    notice: 'Wait for the chat reply to finish, then ask again.',
                });
            return send({ type: 'state', state: 'idle' });
        }
        const user = store.message(id, 'user', text, 'completed');
        const reply = store.message(id, 'assistant', '', 'streaming');
        store.onBoard(user);
        store.onBoard(reply);
        const current = { reply, sentences: [], shown: 0, over: 0, ended: Promise.withResolvers() };
        turn = current;
        send({ type: 'state', state: 'thinking' });
        current.job = ctx.jobs.start(
            'reply',
            id,
            id,
            (job) => {
                const signal = job.controller.signal;
                signal.addEventListener('abort', () => finish(current, 'interrupted'), {
                    once: true,
                });
                return run(current, tree, text, signal).then(() => current.ended.promise);
            },
            { settle: false },
        );
    };
    // The reply is complete once the model has finished and its last sentence has been shown in full.
    const settle = (current) => {
        if (current.generated && current.over === current.sentences.length)
            finish(current, 'completed');
    };
    const progress = (sentence, phase) => {
        const current = turn;
        const index = current?.sentences.findIndex((s) => s.id === sentence) ?? -1;
        if (index < 0) return;
        if (phase === 'start' && index >= current.shown) {
            current.shown = index + 1;
            store.update(current.reply, shownText(current), 'streaming');
        }
        if (phase === 'end' && index < current.shown) {
            current.over = Math.max(current.over, index + 1);
            settle(current);
        }
    };
    // Leaving stops the tutor at once and saves the reply up to the sentence shown.
    function close() {
        if (closed) return;
        closed = true;
        const current = turn;
        if (current) {
            if (current.generated && current.shown === current.sentences.length)
                finish(current, 'completed');
            else current.job.controller.abort();
        }
        process?.close();
        ctx.jobs.remove(session);
        ended.resolve();
        if (ctx.stopping) socket.terminate();
        else socket.close();
    }
    socket.on('message', (data, binary) => {
        if (binary) return;
        let m;
        try {
            m = JSON.parse(data);
        } catch {
            return;
        }
        if (m?.type === 'ask' && typeof m.text === 'string' && m.text.trim())
            ask(m.text.slice(0, 100000));
        if (m?.type === 'progress' && typeof m.sentence === 'string') progress(m.sentence, m.phase);
        if (m?.type === 'leave') close();
    });
    socket.on('close', close);
    socket.on('error', () => {});
}
