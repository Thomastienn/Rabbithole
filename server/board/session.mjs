import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { formatLog, errorCause } from '../log.mjs';
import { validUsage } from '../store/usage.mjs';
import { scriptReader } from './script.mjs';
import { boardOps } from './ops.mjs';
import { boardSystem } from './prompt.mjs';
import { conversationHistory } from '../providers/conversationHistory.mjs';

const STOPPED = 'The tutor stopped. Ask again to carry on.';
const VOICE_UNAVAILABLE = 'The voice is unavailable, so the tutor carries on in captions.';
// A free-space stroke goes to the tutor as this much of the board around it, in board pixels.
const MARGIN = 40;

// The PNG of a free-space stroke: its area of the 1600×900 board, dark ink on white; null when it lies off the board.
// shortcut: draws only the learner's ink, not board items reaching into the crop; draw those too if tutors misread sketches.
function strokeImage(points) {
    const [xs, ys] = [points.map((p) => p[0]), points.map((p) => p[1])];
    const [x, y] = [Math.max(0, Math.min(...xs) - MARGIN), Math.max(0, Math.min(...ys) - MARGIN)];
    const [w, h] = [
        Math.min(1600, Math.max(...xs) + MARGIN) - x,
        Math.min(900, Math.max(...ys) + MARGIN) - y,
    ];
    if (w <= 0 || h <= 0) return null;
    // A lone point still draws as a dot under the round cap.
    const d = `M${points[0]}` + points.map((p) => `L${p}`).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${x} ${y} ${w} ${h}"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff"/><path d="${d}" fill="none" stroke="#111" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    return sharp(Buffer.from(svg)).png().toBuffer();
}

// One board session per open board: the conversation's own model process, its turns and their saving.
// Up: { type: 'ask', text }, { type: 'stroke', points } as the learner finishes a pen stroke, { type: 'progress', sentence, phase: 'start' | 'end' } as each caption shows and ends, { type: 'leave' }.
// Down: { type: 'state', state: 'idle' | 'thinking' | 'speaking' }, { type: 'notice', notice },
// { type: 'sentence', id, text, ops, voiced } with the drawable ops written under it (server/board/ops.mjs),
// then, when voiced, its speech as binary frames (one byte of id length, the id, the audio) and { type: 'audio-end', id },
// a filler clip the same way under the id `filler` when a turn's first audio hasn't started after 1 s,
// { type: 'stroke', item, mark } back for each pen stroke, with what it marks or null,
// { type: 'board', items } once on open: the saved board, replayed from the op lines of every board message.
export function boardSession(ctx, id, socket) {
    const { store, log } = ctx;
    const send = (event) => {
        if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(event));
    };
    // ctx.speech makes the session's edge-tts client (server/board/speech.mjs); off in tests.
    const speech = ctx.speech?.() ?? null;
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
        // The learner's strokes since the last question, as op lines and what each marks; they go with the next one.
        pending = [],
        // The last pen id handed out; never reused in a session, since an erase may be applied but not saved.
        pen = 0,
        // The filler played last, so the next turn's filler differs.
        lastFiller = -1;
    // Filler clips load as the board opens, so the first slow turn has them ready.
    const fillers = speech && ctx.fillers ? ctx.fillers() : null;
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
    const board = boardOps();
    store.boardOpLines(id).forEach((line) => board.read(line));
    if (board.items().length) send({ type: 'board', items: board.items() });
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
            ctx.startVerdicts(id, current.user, current.question, answer);
            ctx.boardSuggestions(id, current.reply, current.question, answer);
        } else if (current.sentences.length) {
            // Claude may have stored text the learner never saw. Replay the saved discussion next time.
            store.forgetThread(id);
        }
        if (turn === current) turn = null;
        ctx.jobs.remove(current.job);
        current.ended.resolve();
        send({ type: 'state', state: 'idle' });
    };
    // Free-space strokes as images, only for a chat model that reads images; the files go once the turn ends.
    const sketches = async (current, tree, free) => {
        if (!free.length || !(await ctx.readsImages({ provider: tree.provider, model }))) return [];
        const drawn = [];
        for (const s of free) {
            const png = await strokeImage(s.points);
            if (png) drawn.push({ id: s.line.split(' ')[0], png });
        }
        if (!drawn.length) return [];
        await mkdir(ctx.dir, { recursive: true, mode: 0o700 });
        current.files = await mkdtemp(join(ctx.dir, 'board-'));
        return Promise.all(
            drawn.map(async ({ id, png }) => {
                const path = join(current.files, `${id}.png`);
                await writeFile(path, png, { mode: 0o600 });
                return { id, type: 'image/png', path };
            }),
        );
    };
    const run = async (current, tree, text, free, signal) => {
        const started = performance.now();
        const reader = scriptReader();
        // A sentence goes down with its ops once they are all written: when the next sentence starts or the reply ends.
        let writing = null;
        const flush = () => {
            if (!writing) return;
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
                    writing = { id: String(++count), text: line.sentence, ops: [], lines: [] };
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
        let result, selection;
        try {
            await ready;
            if (!signal.aborted) await warm(tree, signal);
            if (signal.aborted) result = { status: 'interrupted' };
            else {
                const images = await sketches(current, tree, free);
                const prompt = images.length
                    ? `${text} · images of ${images.map((i) => i.id).join(', ')} attached`
                    : text;
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
        // The question carries what its strokes mark and their ids: "pen: circled t2 · pointed at t3 · strokes p1, p2".
        const marks = Object.entries(
            Object.groupBy(
                pending.flatMap((s) => s.mark ?? []),
                (m) => m.verb,
            ),
        ).map(([verb, ms]) => `${verb} ${[...new Set(ms.flatMap((m) => m.ids))].join(', ')}`);
        if (pending.length)
            store.saveBoardOps(
                user,
                pending.map((s) => s.line),
            );
        const strokes = pending.map((s) => s.line.split(' ')[0]);
        const prompt = strokes.length
            ? `${text}\n\npen: ${[...marks, `strokes ${strokes.join(', ')}`].join(' · ')}`
            : text;
        const free = pending.filter((s) => !s.mark);
        pending = [];
        const current = {
            reply,
            user,
            question: text,
            sentences: [],
            shown: 0,
            over: 0,
            voiced: 0,
            ended: Promise.withResolvers(),
        };
        turn = current;
        speech?.warm();
        if (fillers) current.filler = clock.setTimeout(() => filler(current), 1000);
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
        speech?.close();
        ctx.jobs.remove(session);
        ended.resolve();
        if (ctx.stopping) socket.terminate();
        else socket.close();
    }
    // A pen stroke becomes a board item of its own, `p<n>`, and its line waits for the next question.
    const stroke = (points) => {
        while (board.has(`p${++pen}`));
        const n = pen;
        const mark = board.mark(points);
        const line = [
            `p${n} stroke`,
            mark && `${mark.verb.split(' ')[0]}=${mark.ids.join(',')}`,
            ...points.map((p) => p.join(',')),
        ]
            .filter(Boolean)
            .join(' ');
        const { item } = board.read(line);
        pending.push({ line, mark, points });
        send({ type: 'stroke', item, mark });
    };
    const isPoint = (p) =>
        Array.isArray(p) &&
        p.length === 2 &&
        p.every((v) => Number.isFinite(v) && Math.abs(v) < 1e5);
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
        if (
            m?.type === 'stroke' &&
            Array.isArray(m.points) &&
            m.points.length &&
            m.points.length <= 2000 &&
            m.points.every(isPoint)
        )
            stroke(m.points.map((p) => p.map(Math.round)));
        if (m?.type === 'progress' && typeof m.sentence === 'string') progress(m.sentence, m.phase);
        if (m?.type === 'leave') close();
    });
    socket.on('close', close);
    socket.on('error', () => {});
}
