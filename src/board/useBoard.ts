import { useEffect, useRef, useState } from 'react';
import { boardSocket } from '../serverAccess';
import { toolLine, type Message, type ToolCall } from '../chat/turn';
import { boardPlayer, type Op } from './player';
import { streamedVoice } from './voice';
import { litBy } from './spotlight';
import { levels, openMic } from './mic';
import {
    savePreference,
    savedBoardSpeed,
    savedPushToTalk,
    savedTutorGuided,
} from '../shell/preferences';

export type BoardState = 'idle' | 'thinking' | 'speaking';
type Caption = { text: string; muted: boolean };
const STATES = { thinking: 'Thinking', speaking: 'Speaking' } as const;
// A drawn board item and how long its entry takes; a pointer is passed once its sentence has ended.
export type Drawn = { op: Op; ms: number; passed?: boolean };
// One board reply: the items it drew and its last sentence.
type Reply = { items: Drawn[]; caption: string };
const still = (replies: Reply[]) =>
    replies.map((r) => ({ ...r, items: r.items.map((d) => ({ ...d, ms: 0 })) }));
// A question asked on this board and the sentences of its reply shown so far, under their saved message ids.
// A no-answer turn after a tutor's question has no user message.
export type Turn = { user?: string; reply: string; question: string; said: string[] };
// The mic: off, downloading the speech models (bytes), or on; hearing while the learner speaks, with four level bars.
export type Mic = {
    status: 'off' | 'loading' | 'on';
    loaded?: number;
    total?: number;
    hearing?: boolean;
    levels?: number[];
};
const MIC_OFF: Mic = { status: 'off' };
const BLOCKED =
    'The browser blocked the microphone. Allow it for this page, then press the mic again.';
const NO_MIC =
    "The microphone didn't start. Check that one is connected, then press the mic again.";

// One open board: its socket to the board session, the caption line and the session state.
export function useBoard(conversation: string, messages: Message[], reload: () => void) {
    const latest = messages
        .filter((m) => m.board && m.role === 'assistant' && m.text.trim())
        .at(-1);
    const [state, setState] = useState<BoardState>('idle');
    const [ready, setReady] = useState(false);
    const [notice, setNotice] = useState<string>();
    const [asked, setAsked] = useState(false);
    const [caption, setCaption] = useState<Caption>();
    // The tutor's question or check-in waits for the learner: the waiting cue shows until they speak, type or send.
    const [waiting, setWaiting] = useState(false);
    // The tutor tool running now, if any: the state label names it.
    const [tool, setTool] = useState<ToolCall>();
    const [replies, setReplies] = useState<Reply[]>([]);
    // The earlier reply the learner stepped back to; none shows the latest board.
    const [step, setStep] = useState<number>();
    // A reply that said nothing is not a step of the board.
    const dropSilent = () => setReplies((rs) => (rs.at(-1)?.caption ? rs : rs.slice(0, -1)));
    const onLast = (change: (reply: Reply) => Reply) =>
        setReplies((rs) => [...rs.slice(0, -1), change(rs.at(-1) ?? { items: [], caption: '' })]);
    // A pointer fades when its sentence ends: the next one starts, the tutor stops, or the learner cuts in.
    const passPointers = () =>
        setReplies((rs) =>
            rs.map((r) => ({
                ...r,
                items: r.items.map((d) => (d.op.kind === 'pointer' ? { ...d, passed: true } : d)),
            })),
        );
    // The page the learner opened (ADR 0029); none shows the open page. The tutor's next drawn item brings them back.
    const [view, setView] = useState<string>();
    const viewed = useRef<string>(undefined);
    const look = (page?: string) => {
        viewed.current = page;
        setView(page);
    };
    // Pen strokes over board items since the last question; they go with the next one.
    const [marks, setMarks] = useState(0);
    const restored = latest && { text: latest.text.trim().split('\n').at(-1) ?? '', muted: true };
    const [speed, setSpeed] = useState(savedBoardSpeed);
    const [paused, setPaused] = useState(false);
    // The top-level items the latest sentence with ops drew or named; none shows the whole page.
    const [lit, setLit] = useState<Set<string>>();
    const [turns, setTurns] = useState<Turn[]>([]);
    const question = useRef('');
    const socket = useRef<WebSocket>(undefined);
    const playing = useRef<ReturnType<typeof boardPlayer>>(undefined);
    // Set by a cut-in until the server answers it with a state: sentences of the stopped reply still on the wire are dropped.
    const cut = useRef(false);
    // The mic starts off on every board; while on, its frames go up the socket.
    const [mic, setMic] = useState<Mic>(MIC_OFF);
    const closeMic = useRef<() => void>(undefined);
    const micOn = useRef(false);
    // Push-to-talk, read from Settings on each render: frames go up only while Space or the mic is held.
    const pushToTalk = savedPushToTalk();
    const ptt = useRef(pushToTalk);
    ptt.current = pushToTalk;
    const holding = useRef(false);
    const stopMic = () => {
        closeMic.current?.();
        closeMic.current = undefined;
        micOn.current = holding.current = false;
        setMic(MIC_OFF);
    };
    // A question sent, typed or spoken: it shows muted until the tutor speaks, so the learner sees it was heard.
    const shown = (text: string) => {
        question.current = text;
        setAsked(true);
        setMarks(0);
        setNotice(undefined);
        setLit(undefined);
        passPointers();
        setCaption({ text, muted: true });
        // Asking returns to the latest board, which the new reply draws on.
        setStep(undefined);
        setReplies((rs) => [...rs, { items: [], caption: '' }]);
    };
    useEffect(() => {
        const ws = boardSocket(conversation, savedTutorGuided());
        socket.current = ws;
        const send = (message: object) => {
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
        };
        const player = boardPlayer(
            (s) => {
                setCaption({ text: s.text, muted: false });
                passPointers();
                // A sentence that draws or names nothing keeps the lit set it inherited.
                const names = litBy(s.ops);
                if (names.length) setLit(new Set(names));
                setTurns((all) =>
                    all.map((t, i) =>
                        i === all.length - 1 ? { ...t, said: [...t.said, s.text] } : t,
                    ),
                );
                onLast((r) => ({ ...r, caption: s.text }));
            },
            // A retimed op comes again with its new entry time and replaces its first draw.
            // A late timer can squeeze an entry to 0 ms, which marks a replayed item, and a replayed pointer is hidden.
            (op, entry) => {
                const ms = Math.max(entry, 1);
                if (viewed.current) {
                    look(undefined);
                    send({ type: 'view' });
                }
                onLast((r) => ({
                    ...r,
                    items: r.items.some((item) => item.op.id === op.id)
                        ? r.items.map((item) => (item.op.id === op.id ? { op, ms } : item))
                        : [...r.items, { op, ms }],
                }));
            },
            (s, phase) => send({ type: 'progress', sentence: s.id, phase }),
            streamedVoice(),
        );
        player.speed(speed);
        playing.current = player;
        ws.binaryType = 'arraybuffer';
        ws.onopen = () => setReady(true);
        ws.onclose = () => {
            stopMic();
            player.stop();
            setPaused(false);
            setReady(false);
            setState('idle');
            setLit(undefined);
            setCaption((c) => c && { ...c, muted: true });
            dropSilent();
            setNotice('The board disconnected. Turn Board off and on to reconnect.');
        };
        ws.onmessage = (event) => {
            // A speech chunk: one byte of sentence id length, the id, then the audio.
            if (event.data instanceof ArrayBuffer) {
                const bytes = new Uint8Array(event.data);
                const id = new TextDecoder().decode(bytes.subarray(1, 1 + bytes[0]));
                return player.chunk(id, bytes.subarray(1 + bytes[0]));
            }
            const m = JSON.parse(event.data);
            if (m.type === 'state') {
                cut.current = false;
                setState(m.state);
                setWaiting(!!m.waiting);
                if (m.reply)
                    setTurns((all) => [
                        ...all,
                        {
                            user: m.user ?? undefined,
                            reply: m.reply,
                            question: m.user ? question.current : '',
                            said: [],
                        },
                    ]);
                // A no-answer turn draws its hint or carry-on as a step of its own.
                if (m.reply && !m.user) setReplies((rs) => [...rs, { items: [], caption: '' }]);
                // Idle ends the reply: anything not yet shown is dropped and the last caption is held,
                // muted, except a question waiting for its answer, which stays in ink.
                if (m.state === 'idle') {
                    setTool(undefined);
                    player.stop();
                    setPaused(false);
                    setLit(undefined);
                    passPointers();
                    if (!m.waiting) setCaption((c) => c && { ...c, muted: true });
                    dropSilent();
                }
            }
            // The saved board shows at once, without entry.
            if (m.type === 'board')
                setReplies(
                    m.replies.map((r: { caption: string; items: Op[] }) => ({
                        caption: r.caption,
                        items: r.items.map((op) => ({ op, ms: 0 })),
                    })),
                );
            if (m.type === 'sentence' && !cut.current) player.add(m);
            if (m.type === 'offsets') player.offsets(m);
            if (m.type === 'audio-end') player.audioEnd(m.id);
            // A stroke joins the board it was drawn on, as the server replays it.
            if (m.type === 'stroke') {
                onLast((r) => ({ ...r, items: [...r.items, { op: m.item, ms: 0 }] }));
                if (m.mark) setMarks((n) => n + 1);
            }
            if (m.type === 'tool')
                setTool((t) =>
                    m.tool.status === 'running' ? m.tool : t?.id === m.tool.id ? undefined : t,
                );
            if (m.type === 'notice') setNotice(m.notice);
            if (m.type === 'mic') {
                if (m.status === 'off') stopMic();
                else if (closeMic.current) {
                    micOn.current = m.status === 'on';
                    setMic({ status: m.status, loaded: m.loaded, total: m.total });
                    // The first hold downloads the models and records once they are ready, if still held.
                    if (micOn.current && ptt.current && holding.current) sendHold(true);
                }
            }
            if (m.type === 'hearing' && m.on) setWaiting(false);
            if (m.type === 'hearing')
                setMic((mic) =>
                    mic.status === 'on'
                        ? { ...mic, hearing: m.on, levels: [0.2, 0.2, 0.2, 0.2] }
                        : mic,
                );
            // A spoken question was recognized and sent.
            if (m.type === 'heard') shown(m.text);
        };
        return () => {
            stopMic();
            player.stop();
            setPaused(false);
            ws.onopen = ws.onmessage = null;
            ws.onclose = null;
            if (ws.readyState === WebSocket.OPEN) {
                // The server closes once the reply is saved; a stalled one is closed here.
                const timeout = setTimeout(() => ws.close(), 2000);
                ws.onclose = () => {
                    clearTimeout(timeout);
                    reload();
                };
                ws.send(JSON.stringify({ type: 'leave' }));
            } else {
                ws.close();
                reload();
            }
        };
    }, [conversation]);
    const ask = (text: string, files: File[] = []) => {
        const ws = socket.current;
        if (ws?.readyState !== WebSocket.OPEN) return false;
        // Files go base64 in the ask message, read first; the server prepares them as a chat send does.
        if (files.length)
            void Promise.all(files.map(encoded)).then((encodedFiles) =>
                ws.send(JSON.stringify({ type: 'ask', text, files: encodedFiles })),
            );
        else ws.send(JSON.stringify({ type: 'ask', text }));
        // Sending mid-reply cuts in: the tutor stops here at once, without waiting on the server.
        if (state === 'speaking') {
            cut.current = true;
            playing.current?.stop();
            setPaused(false);
        }
        shown(text);
        setState('thinking');
        return true;
    };
    const at = step ?? replies.length - 1;
    // Stepping replays the stored items at once, and so does coming back to the latest board.
    const go = (to: number) => {
        setReplies(still);
        setStep(to < replies.length - 1 ? to : undefined);
    };
    // A finished pen stroke, in board pixels; the server hit-tests it and sends it back as an item.
    const draw = (points: [number, number][]) => {
        const ws = socket.current;
        if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'stroke', points }));
    };
    // The learner opens a page; the session asks from it next (server/board/pen.mjs).
    const openPage = (page: string) => {
        look(page);
        const ws = socket.current;
        if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'view', page }));
    };
    // The learner started typing: a question's wait holds open until they send.
    const typing = () => {
        setWaiting(false);
        const ws = socket.current;
        if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'typing' }));
    };
    // One press turns the mic on, asking the browser for it first; another turns it off.
    const toggleMic = async () => {
        const ws = socket.current;
        if (mic.status !== 'off' || closeMic.current) {
            if (ws?.readyState === WebSocket.OPEN)
                ws.send(JSON.stringify({ type: 'mic', on: false }));
            return stopMic();
        }
        return startMic();
    };
    // Push-to-talk tells the server where a question starts and ends; the server stops the tutor as it starts.
    function sendHold(down: boolean) {
        const ws = socket.current;
        if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'hold', on: down }));
        setMic((mic) => ({ ...mic, hearing: down, levels: [0.2, 0.2, 0.2, 0.2] }));
    }
    // Holding Space or the mic with push-to-talk on; the first hold turns the mic on.
    const hold = (down: boolean) => {
        if (down === holding.current) return;
        holding.current = down;
        if (micOn.current) sendHold(down);
        else if (down && !closeMic.current) void startMic();
    };
    const startMic = async () => {
        const ws = socket.current;
        if (ws?.readyState !== WebSocket.OPEN) return;
        // A placeholder while the browser asks, so a second press cancels instead of asking twice.
        closeMic.current = () => {};
        try {
            const close = await openMic((samples) => {
                if (!micOn.current || ws.readyState !== WebSocket.OPEN) return;
                if (ptt.current && !holding.current) return;
                ws.send(samples.buffer);
                setMic((mic) =>
                    mic.hearing ? { ...mic, levels: levels(samples, mic.levels ?? []) } : mic,
                );
            });
            // Off again, or the board closed, while the browser asked.
            if (!closeMic.current || ws.readyState !== WebSocket.OPEN) return close();
            closeMic.current = close;
        } catch (error) {
            closeMic.current = undefined;
            return setNotice((error as Error).name === 'NotAllowedError' ? BLOCKED : NO_MIC);
        }
        setNotice(undefined);
        ws.send(JSON.stringify({ type: 'mic', on: true }));
    };
    const changeSpeed = (rate: number) => {
        setSpeed(rate);
        savePreference('board-speed', String(rate));
        playing.current?.speed(rate);
    };
    const pause = (on: boolean) => {
        setPaused(on);
        playing.current?.pause(on);
    };
    // Ends the session now; resolves once the server has saved the reply up to the sentence shown and freed the conversation.
    const leave = () =>
        new Promise<void>((done) => {
            const ws = socket.current;
            if (ws?.readyState !== WebSocket.OPEN) return done();
            const closed = ws.onclose;
            const timeout = setTimeout(() => ws.close(), 2000);
            ws.onclose = (e) => {
                clearTimeout(timeout);
                closed?.call(ws, e);
                done();
            };
            ws.send(JSON.stringify({ type: 'leave' }));
        });
    return {
        state,
        // The state label: the running tutor tool, such as "Running read_page…", else the state.
        label: tool ? toolLine([tool]) : STATES[state as keyof typeof STATES],
        turns,
        leave,
        speed,
        paused,
        // The spotlight is on only while the tutor speaks on the latest board, unpaused.
        lit: state === 'speaking' && !paused && step === undefined ? lit : undefined,
        changeSpeed,
        pause,
        mic,
        toggleMic,
        pushToTalk,
        hold,
        ready,
        notice,
        asked: asked || messages.some((m) => m.board),
        caption:
            step === undefined
                ? (caption ?? restored)
                : { text: replies[step].caption, muted: true },
        items: replies.slice(0, at + 1).flatMap((r) => r.items),
        replies: replies.length,
        // The reply on show, from 0, and whether it is an earlier one.
        at,
        stepped: step !== undefined,
        go,
        view,
        openPage,
        marks,
        ask,
        typing,
        draw,
        waiting,
    };
}

// A file as the board's ask message carries it, its bytes in base64.
const encoded = async (file: File) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000)
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { name: file.name, type: file.type, data: btoa(binary) };
};
