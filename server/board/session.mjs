import { rm } from 'node:fs/promises';
import { formatLog, errorCause } from '../log.mjs';
import { validUsage } from '../store/usage.mjs';
import { scriptReader } from './script.mjs';
import { boardOps } from './ops.mjs';
import { boardSystem } from './prompt.mjs';
import { boardMic } from './mic.mjs';
import { boardPen } from './pen.mjs';
import { conversationHistory } from '../providers/conversationHistory.mjs';

const STOPPED = 'The tutor stopped. Ask again to carry on.';
const VOICE_UNAVAILABLE = 'The voice is unavailable, so the tutor carries on in captions.';
// After a `?> ` question the board waits this long for an answer, then sends the next no-answer turn.
export const WAIT_MS = 4000;
// The no-answer turns: system turns, never learner messages (docs/board-spec.md, Tutor-guided).
export const NO_ANSWER = [
    '(No answer yet: the learner stayed quiet after your question. Give one short hint toward the answer, without mentioning the silence, and no "?> " line.)',
    '(Still no answer. Give the answer and carry on teaching where you were, without mentioning the silence.)',
];

// One board session per open board: the conversation's own model process, its turns and their saving.
// Up: { type: 'ask', text }, { type: 'mic', on }, { type: 'hold', on } as push-to-talk is held and let go, and, while on, mic audio as binary frames of 16 kHz mono float32 samples, { type: 'stroke', points } as the learner finishes a pen stroke, { type: 'view', page } as the learner opens a board page (no page: the view follows the tutor's page again), { type: 'progress', sentence, phase: 'start' | 'end' } as each caption shows and ends, { type: 'leave' }.
// Down: { type: 'state', state: 'idle' | 'thinking' | 'speaking' }, thinking with the turn's user and reply message ids, { type: 'notice', notice },
// { type: 'sentence', id, text, ops, voiced } with the drawable ops written under it (server/board/ops.mjs),
// then, when voiced, its speech as binary frames (one byte of id length, the id, the audio) and { type: 'audio-end', id },
// a filler clip the same way under the id `filler` when a turn's first audio hasn't started after 1 s,
// { type: 'stroke', item, mark } back for each pen stroke, with what it marks or null, and { item } for each page opened,
// { type: 'board', replies: [{ caption, items }] } once on open: the saved board, each reply's items replayed
// from its op lines with the reply's last sentence as its caption,
// { type: 'mic', status: 'loading' | 'on' | 'off', loaded, total } as the speech models download and the mic turns on or off,
// { type: 'hearing', on } as the learner starts and stops speaking, and { type: 'heard', text } as a spoken question is sent.
// lang: the board's Voice language; guided: the learner chose tutor-guided boards in Settings;
// checkIns: how often the tutor checks in, 'off' | 'sometimes' | 'often'.
// A sentence's prosody rate in percent (docs/board-sketches-spec.md, Pacing): a key sentence and one drawing math
// are said slower, the slower of the two when both apply; the client stretches its caption estimate to match.
const KEY_RATE = -15;
const MATH_RATE = -10;
export const sentenceRate = (sentence) =>
    Math.min(
        sentence.key ? KEY_RATE : 0,
        sentence.ops.some((op) => op.kind === 'math') ? MATH_RATE : 0,
    );

export function boardSession(ctx, id, socket, lang = 'en', guided = false, checkIns = 'sometimes') {
    const { store, log } = ctx;
    const send = (event) => {
        if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(event));
    };
    // ctx.speech makes the session's edge-tts client for its Voice language (server/board/speech.mjs); off in tests.
    const speech = ctx.speech?.(lang) ?? null;
    const sendAudio = (id, chunk) => {
        if (socket.readyState === socket.OPEN)
            socket.send(Buffer.concat([Buffer.from([id.length]), Buffer.from(id), chunk]));
    };
    let process = null,
        model,
        warmedFor,
        turn = null,
        closed = false,
        count = 0,
        // The timer of the wait after a question, until an answer or the next no-answer turn.
        waiting = null,
        // The learner started typing an answer: no wait starts until they send it.
        drafting = false,
        // The filler played last, so the next turn's filler differs.
        lastFiller = -1;
    // Filler clips load as the board opens, so the first slow turn has them ready.
    const fillers = speech && ctx.fillers ? ctx.fillers(lang) : null;
    const clock = ctx.boardClock;
    // The turn's first audio has started (or its first sentence has none): no filler from now on.
    const heard = (current) => {
        current.heard = true;
        clock.clearTimeout(current.filler);
    };
    // A filler never repeats the last one and is never part of the reply.
    const filler = async (current) => {
        const clips = await fillers.catch(() => []);
        if (current.heard || current.done) return;
        const choices = clips.map((_, i) => i).filter((i) => i !== lastFiller);
        if (!choices.length) return;
        lastFiller = choices[Math.floor(Math.random() * choices.length)];
        sendAudio('filler', clips[lastFiller]);
        send({ type: 'audio-end', id: 'filler' });
    };
    // The items drawn on this board so far, across its turns.
    let board;
    const pen = boardPen(ctx, () => board, send);
    // An answer starting, typed, spoken or drawn, holds the wait open: no hint comes.
    const answering = () => {
        clock.clearTimeout(waiting);
        waiting = null;
    };
    // Rebuilds the board from the saved turns, and returns them as replies.
    const load = () => {
        board = boardOps();
        const replies = [];
        for (const { role, text, lines } of store.boardReplies(id)) {
            const items = lines.flatMap((line) => board.read(line).item ?? []);
            // The learner's strokes join the board they were drawn on; a reply that said nothing is not a step.
            if (role === 'user') {
                if (!replies.length) replies.push({ caption: '', items: [] });
                replies.at(-1).items.push(...items);
            } else if (text.trim())
                replies.push({ caption: text.trim().split('\n').at(-1), items });
            // The page open at the end of each reply (ADR 0029).
            if (replies.length) replies.at(-1).page = board.open();
        }
        return replies;
    };
    const replies = load();
    if (replies.length) send({ type: 'board', replies });
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
                lang,
                guided,
                checkIns,
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
    const save = (current, status, stopped) => {
        store.update(current.reply, shownText(current), status, stopped);
        store.saveBoardOps(
            current.reply,
            current.sentences.slice(0, current.shown).flatMap((s) => s.lines),
        );
    };
    // Saves the reply with every sentence that started showing, and their op lines; the rest is dropped.
    const finish = (current, status) => {
        if (current.done) return;
        current.done = true;
        heard(current);
        if (status === 'failed') current.job.controller.abort();
        const stopped = status === 'interrupted' ? (ctx.stopping ? 'shutdown' : 'learner') : null;
        save(current, status, stopped);
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
            // As after a chat reply: familiarity from the learner's question and concepts from the reply,
            // but no suggestion marks or next questions (docs/board-spec.md).
            const answer = shownText(current);
            // A no-answer turn has no learner message, so it is no familiarity evidence.
            if (current.user) ctx.startVerdicts(id, current.user, current.question, answer);
            ctx.boardSuggestions(id, current.reply, current.question, answer);
        } else if (current.sentences.length) {
            // Claude may have stored text the learner never saw. Replay the saved discussion next time.
            store.forgetThread(id);
        }
        // Ops of sentences that never played leave the board; pen strokes waiting for the next question stay.
        if (status !== 'completed' && !closed) {
            load();
            pen.replay();
        }
        if (turn === current) turn = null;
        if (!closed) pen.settle();
        ctx.jobs.remove(current.job);
        current.ended.resolve();
        // A question waits for its answer; the hint turn always waits once more, then the tutor carries on.
        // A check-in waits with no timer: the next turn is the learner's own.
        let checkIn = false;
        if (status === 'completed' && !closed && turn === null && !current.cut && !drafting) {
            const next = current.noAnswer === 1 ? 2 : current.sentences.at(-1)?.question ? 1 : 0;
            if (next) waiting = clock.setTimeout(() => ask(NO_ANSWER[next - 1], next), WAIT_MS);
            else checkIn = !!current.sentences.at(-1)?.checkIn;
        }
        send({ type: 'state', state: 'idle', ...((waiting || checkIn) && { waiting: true }) });
    };
    const run = async (current, tree, text, free, signal) => {
        const started = performance.now();
        const reader = scriptReader();
        // A sentence goes down with its ops once they are all written: when the next sentence starts or the reply ends.
        let writing = null;
        const flush = () => {
            if (!writing) return;
            writing.rate = sentenceRate(writing);
            current.sentences.push(writing);
            if (current.sentences.length === 1) send({ type: 'state', state: 'speaking' });
            const { lines, ...sentence } = writing;
            send({ type: 'sentence', ...sentence, ...(speech && { voiced: true }) });
            writing = null;
            speak(current);
        };
        const add = (lines, ended = false) => {
            if (current.done) return;
            for (const line of lines) {
                if (line.sentence !== undefined) {
                    flush();
                    writing = {
                        id: String(++count),
                        text: line.sentence,
                        question: line.question,
                        checkIn: line.checkIn,
                        key: line.key,
                        ops: [],
                        lines: [],
                    };
                    continue;
                }
                const { item, moved, error } = writing
                    ? board.read(line.op)
                    : { error: 'op before its sentence' };
                // Moves show prompt regressions in the log (docs/board-spec.md, the guard).
                if (moved) log(formatLog('info', 'board', 'item moved', { id: item.id }));
                if (item) {
                    writing.ops.push(item);
                    writing.lines.push(line.op);
                }
                // The learner never sees a broken op; the log keeps why it was skipped.
                else
                    log(
                        formatLog('warn', 'board', 'op skipped', {
                            id: current.reply,
                            cause: error,
                        }),
                    );
            }
            if (ended || reader.nextSentence()) flush();
        };
        let result, selection, index;
        try {
            await ready;
            if (!signal.aborted) await warm(tree, signal);
            if (signal.aborted) result = { status: 'interrupted' };
            else {
                const images = await pen.sketches(current, tree, model, free);
                // The model gets only spoken captions back from history, so each turn says what pages exist.
                index = board.index();
                const prompt = `${index}\n\n${
                    images.length
                        ? `${text} · images of ${images.map((i) => i.id).join(', ')} attached`
                        : text
                }`;
                selection = { provider: tree.provider, model };
                result = await process.ask(prompt, (e) => add(reader.feed(e.text)), signal, images);
            }
        } catch (error) {
            result = { status: 'failed', cause: error };
        } finally {
            if (current.files)
                await rm(current.files, { recursive: true, force: true }).catch(() => {});
        }
        if (result.status === 'completed') add(reader.end(), true);
        const usage = result.usage;
        // Account for the call even if playback stopped before the provider reported its totals.
        if (selection)
            store.record(
                `chat:${current.reply}`,
                'chat',
                selection,
                usage && { ...usage, reasoning: usage.thinking },
            );
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
                    // Untested: how large the index grows on a long board (docs/board-pages-and-check-ins-spec.md).
                    index: index?.length,
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
    // A learner's question, or with noAnswer 1 or 2 a no-answer turn after the wait.
    const ask = (text, noAnswer = 0) => {
        if (closed) return;
        // Sending mid-reply cuts in: the reply stops, saved up to the sentence heard, and the question starts a new turn.
        if (turn) stop(turn);
        answering();
        drafting = false;
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
        // A tree started on the board is named from its first question, as a chat's first send is.
        if (!noAnswer && !tree.messages.length && !tree.title_renamed) ctx.startTitle(id, text);
        const user = noAnswer ? null : store.message(id, 'user', text, 'completed');
        const reply = store.message(id, 'assistant', '', 'streaming');
        if (user) store.onBoard(user);
        store.onBoard(reply);
        // A no-answer turn leaves the pen's strokes for the learner's next question, and draws on the tutor's page.
        if (noAnswer) pen.view();
        const { lines, note, free } = noAnswer ? { lines: [], free: [] } : pen.take();
        if (lines.length) store.saveBoardOps(user, lines);
        // The provider got text the learner never heard, so a turn after a cut names where the learner stopped hearing.
        const last = tree.messages.at(-1);
        const cut =
            last?.board && last.role === 'assistant' && last.status === 'interrupted' && last.text
                ? `(You were cut off. The last sentence the learner heard was "${last.text.split('\n').at(-1)}"; they did not hear the rest of that reply.)\n\n`
                : '';
        const prompt = cut + (note ? `${text}\n\n${note}` : text);
        const current = {
            reply,
            user,
            noAnswer,
            // Quick thinking judges a no-answer turn's concepts against the learner's last question.
            question: user ? text : (tree.messages.findLast((m) => m.role === 'user')?.text ?? ''),
            sentences: [],
            shown: 0,
            over: 0,
            voiced: 0,
            ended: Promise.withResolvers(),
        };
        turn = current;
        speech?.warm();
        if (fillers) current.filler = clock.setTimeout(() => filler(current), 1000);
        // The ids let the transcript rail branch from this turn's reply.
        send({ type: 'state', state: 'thinking', user, reply });
        current.job = ctx.jobs.start(
            'reply',
            id,
            id,
            (job) => {
                const signal = job.controller.signal;
                signal.addEventListener('abort', () => finish(current, 'interrupted'), {
                    once: true,
                });
                return run(current, tree, prompt, free, signal).then(() => current.ended.promise);
            },
            { settle: false },
        );
    };
    // Speech runs one sentence ahead of playback: a sentence synthesizes once the one before it starts playing.
    // A sentence with no audio yet is tried twice; when speech still fails, the rest of the turn is captions only.
    const speak = (current) => {
        const sentence = current.sentences[current.voiced];
        if (!speech || current.speaking || !sentence || current.voiced > current.shown) return;
        current.voiced++;
        current.speaking = true;
        const signal = current.job.controller.signal;
        let spoke = false;
        const say = () =>
            speech.speak(
                sentence.text,
                (chunk) => {
                    spoke = true;
                    if (current.done) return;
                    heard(current);
                    sendAudio(sentence.id, chunk);
                },
                signal,
                sentence.rate,
            );
        (current.silent
            ? Promise.resolve()
            : say().catch((error) => {
                  if (spoke || signal.aborted) throw error;
                  return say();
              })
        )
            .catch((error) => {
                if (signal.aborted) return;
                log(
                    formatLog('warn', 'board', 'speech failed', {
                        id: current.reply,
                        cause: errorCause(error, [sentence.text]),
                    }),
                );
                if (spoke) return;
                current.silent = true;
                send({ type: 'notice', notice: VOICE_UNAVAILABLE });
            })
            .finally(() => {
                current.speaking = false;
                if (current.done) return;
                heard(current);
                send({ type: 'audio-end', id: sentence.id });
                speak(current);
            });
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
            save(current, 'streaming');
            speak(current);
        }
        if (phase === 'end' && index < current.shown) {
            current.over = Math.max(current.over, index + 1);
            settle(current);
        }
    };
    // A reply the learner has seen in full completes; any other stops at once.
    const stop = (current) => {
        // Only the learner cuts in or leaves, so a stopped question waits for no answer.
        current.cut = true;
        if (current.generated && current.shown === current.sentences.length)
            finish(current, 'completed');
        else current.job.controller.abort();
    };
    // Leaving stops the tutor at once and saves the reply up to the sentence shown.
    function close() {
        if (closed) return;
        closed = true;
        answering();
        if (turn) stop(turn);
        process?.close();
        speech?.close();
        ctx.jobs.remove(session);
        ended.resolve();
        if (ctx.stopping) socket.terminate();
        else socket.close();
    }
    const isPoint = (p) =>
        Array.isArray(p) &&
        p.length === 2 &&
        p.every((v) => Number.isFinite(v) && Math.abs(v) < 1e5);
    const busy = () => turn;
    const mic = boardMic(ctx.hearing, lang, {
        send: (event) => (event.type === 'hearing' && event.on && answering(), send(event)),
        log,
        ask,
        stop,
        busy,
        closed: () => closed,
    });
    socket.on('message', (data, binary) => {
        if (binary) return mic.audio(data);
        let m;
        try {
            m = JSON.parse(data);
        } catch {
            return;
        }
        if (m?.type === 'ask' && typeof m.text === 'string' && m.text.trim())
            ask(m.text.slice(0, 100000));
        if (
            m?.type === 'stroke' &&
            Array.isArray(m.points) &&
            m.points.length &&
            m.points.length <= 2000 &&
            m.points.every(isPoint)
        ) {
            answering();
            send({ type: 'stroke', ...pen.stroke(m.points.map((p) => p.map(Math.round))) });
        }
        if (m?.type === 'view') pen.view(m.page, !!turn);
        if (m?.type === 'progress' && typeof m.sentence === 'string') progress(m.sentence, m.phase);
        if (m?.type === 'mic') m.on ? mic.on() : mic.off();
        if (m?.type === 'hold') {
            if (m.on) answering();
            mic.hold(!!m.on);
        }
        if (m?.type === 'typing') {
            drafting = true;
            answering();
        }
        if (m?.type === 'leave') close();
    });
    socket.on('close', close);
    socket.on('error', () => {});
}
