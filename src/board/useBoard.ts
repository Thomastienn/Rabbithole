import { useEffect, useRef, useState } from 'react';
import { boardSocket } from '../serverAccess';
import type { Message } from '../chat/turn';
import { boardPlayer, type Op } from './player';
import { streamedVoice } from './voice';
import { savePreference, savedBoardSpeed } from '../shell/preferences';

export type BoardState = 'idle' | 'thinking' | 'speaking';
type Caption = { text: string; muted: boolean };
// A drawn board item and how long its entry takes.
export type Drawn = { op: Op; ms: number };
// One board reply: the items it drew and its last sentence.
type Reply = { items: Drawn[]; caption: string };
const still = (replies: Reply[]) =>
    replies.map((r) => ({ ...r, items: r.items.map((d) => ({ ...d, ms: 0 })) }));

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
    const [replies, setReplies] = useState<Reply[]>([]);
    // The earlier reply the learner stepped back to; none shows the latest board.
    const [step, setStep] = useState<number>();
    // A reply that said nothing is not a step of the board.
    const dropSilent = () => setReplies((rs) => (rs.at(-1)?.caption ? rs : rs.slice(0, -1)));
    const onLast = (change: (reply: Reply) => Reply) =>
        setReplies((rs) => [...rs.slice(0, -1), change(rs.at(-1) ?? { items: [], caption: '' })]);
    // Pen strokes over board items since the last question; they go with the next one.
    const [marks, setMarks] = useState(0);
    const restored = latest && { text: latest.text.trim().split('\n').at(-1) ?? '', muted: true };
    const [speed, setSpeed] = useState(savedBoardSpeed);
    const [paused, setPaused] = useState(false);
    const socket = useRef<WebSocket>(undefined);
    const playing = useRef<ReturnType<typeof boardPlayer>>(undefined);
    // Set by a cut-in until the server answers it with a state: sentences of the stopped reply still on the wire are dropped.
    const cut = useRef(false);
    useEffect(() => {
        const ws = boardSocket(conversation);
        socket.current = ws;
        const send = (message: object) => {
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
        };
        const player = boardPlayer(
            (s) => {
                setCaption({ text: s.text, muted: false });
                onLast((r) => ({ ...r, caption: s.text }));
            },
            // A retimed op comes again with its new entry time and replaces its first draw.
            (op, ms) =>
                onLast((r) => ({
                    ...r,
                    items: r.items.some((item) => item.op.id === op.id)
                        ? r.items.map((item) => (item.op.id === op.id ? { op, ms } : item))
                        : [...r.items, { op, ms }],
                })),
            (s, phase) => send({ type: 'progress', sentence: s.id, phase }),
            streamedVoice(),
        );
        player.speed(speed);
        playing.current = player;
        ws.binaryType = 'arraybuffer';
        ws.onopen = () => setReady(true);
        ws.onclose = () => {
            player.stop();
            setPaused(false);
            setReady(false);
            setState('idle');
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
                // Idle ends the reply: anything not yet shown is dropped and the last caption is held, muted.
                if (m.state === 'idle') {
                    player.stop();
                    setPaused(false);
                    setCaption((c) => c && { ...c, muted: true });
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
            if (m.type === 'audio-end') player.audioEnd(m.id);
            // A stroke joins the board it was drawn on, as the server replays it.
            if (m.type === 'stroke') {
                onLast((r) => ({ ...r, items: [...r.items, { op: m.item, ms: 0 }] }));
                if (m.mark) setMarks((n) => n + 1);
            }
            if (m.type === 'notice') setNotice(m.notice);
        };
        return () => {
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
    const ask = (text: string) => {
        const ws = socket.current;
        if (ws?.readyState !== WebSocket.OPEN) return false;
        ws.send(JSON.stringify({ type: 'ask', text }));
        // Sending mid-reply cuts in: the tutor stops here at once, without waiting on the server.
        if (state === 'speaking') {
            cut.current = true;
            playing.current?.stop();
            setPaused(false);
        }
        setAsked(true);
        setMarks(0);
        setNotice(undefined);
        // The sent question shows muted until the tutor speaks, so the learner sees it was heard.
        setCaption({ text, muted: true });
        setState('thinking');
        // Asking returns to the latest board, which the new reply draws on.
        setStep(undefined);
        setReplies((rs) => [...rs, { items: [], caption: '' }]);
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
    const changeSpeed = (rate: number) => {
        setSpeed(rate);
        savePreference('board-speed', String(rate));
        playing.current?.speed(rate);
    };
    const pause = (on: boolean) => {
        setPaused(on);
        playing.current?.pause(on);
    };
    return {
        state,
        speed,
        paused,
        changeSpeed,
        pause,
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
        marks,
        ask,
        draw,
    };
}
