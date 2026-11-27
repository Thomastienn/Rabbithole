import { useEffect, useRef, useState } from 'react';
import { boardSocket } from '../serverAccess';
import type { Message } from '../chat/turn';
import { boardPlayer, type Op } from './player';
import { streamedVoice } from './voice';
import { levels, openMic } from './mic';
import { savePreference, savedBoardSpeed } from '../shell/preferences';

export type BoardState = 'idle' | 'thinking' | 'speaking';
type Caption = { text: string; muted: boolean };
// A drawn board item, how long its entry takes and, once erased, how long its fade takes.
export type Drawn = { op: Op; ms: number; erased?: number };
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
    const [items, setItems] = useState<Drawn[]>([]);
    // Pen strokes over board items since the last question; they go with the next one.
    const [marks, setMarks] = useState(0);
    const restored = latest && { text: latest.text.trim().split('\n').at(-1) ?? '', muted: true };
    const [speed, setSpeed] = useState(savedBoardSpeed);
    const [paused, setPaused] = useState(false);
    const socket = useRef<WebSocket>(undefined);
    const playing = useRef<ReturnType<typeof boardPlayer>>(undefined);
    // Set by a cut-in until the server answers it with a state: sentences of the stopped reply still on the wire are dropped.
    const cut = useRef(false);
    // The mic starts off on every board; while on, its frames go up the socket.
    const [mic, setMic] = useState<Mic>(MIC_OFF);
    const closeMic = useRef<() => void>(undefined);
    const micOn = useRef(false);
    const stopMic = () => {
        closeMic.current?.();
        closeMic.current = undefined;
        micOn.current = false;
        setMic(MIC_OFF);
    };
    useEffect(() => {
        const ws = boardSocket(conversation);
        socket.current = ws;
        const send = (message: object) => {
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
        };
        // Erased items fade out over the op's share of its sentence, then leave the board.
        const erase = (ids: string[], ms: number) => {
            setItems((drawn) =>
                drawn.map((d) => (ids.includes(d.op.id) ? { ...d, erased: ms } : d)),
            );
            player.wait(
                () =>
                    setItems((drawn) =>
                        drawn.filter((d) => d.erased === undefined || !ids.includes(d.op.id)),
                    ),
                ms,
            );
        };
        const player = boardPlayer(
            (s) => setCaption({ text: s.text, muted: false }),
            (op, ms) =>
                op.kind === 'erase'
                    ? erase(op.ids ?? [], ms)
                    : setItems((drawn) =>
                          drawn.some((item) => item.op.id === op.id)
                              ? drawn.map((item) => (item.op.id === op.id ? { op, ms } : item))
                              : [...drawn, { op, ms }],
                      ),
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
            setCaption((c) => c && { ...c, muted: true });
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
                }
            }
            // The saved board shows at once, without entry.
            if (m.type === 'board') setItems(m.items.map((op: Op) => ({ op, ms: 0 })));
            if (m.type === 'sentence' && !cut.current) player.add(m);
            if (m.type === 'audio-end') player.audioEnd(m.id);
            if (m.type === 'stroke') {
                setItems((drawn) => [...drawn, { op: m.item, ms: 0 }]);
                if (m.mark) setMarks((n) => n + 1);
            }
            if (m.type === 'notice') setNotice(m.notice);
            if (m.type === 'mic') {
                if (m.status === 'off') stopMic();
                else if (closeMic.current) {
                    micOn.current = m.status === 'on';
                    setMic({ status: m.status, loaded: m.loaded, total: m.total });
                }
            }
            if (m.type === 'hearing')
                setMic((mic) =>
                    mic.status === 'on'
                        ? { ...mic, hearing: m.on, levels: [0.2, 0.2, 0.2, 0.2] }
                        : mic,
                );
            // A spoken question was recognized and sent: it shows muted while the tutor thinks, as a typed one.
            if (m.type === 'heard') {
                setAsked(true);
                setMarks(0);
                setNotice(undefined);
                setCaption({ text: m.text, muted: true });
            }
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
        return true;
    };
    // A finished pen stroke, in board pixels; the server hit-tests it and sends it back as an item.
    const draw = (points: [number, number][]) => {
        const ws = socket.current;
        if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'stroke', points }));
    };
    // One press turns the mic on, asking the browser for it first; another turns it off.
    const toggleMic = async () => {
        const ws = socket.current;
        if (mic.status !== 'off' || closeMic.current) {
            if (ws?.readyState === WebSocket.OPEN)
                ws.send(JSON.stringify({ type: 'mic', on: false }));
            return stopMic();
        }
        if (ws?.readyState !== WebSocket.OPEN) return;
        // A placeholder while the browser asks, so a second press cancels instead of asking twice.
        closeMic.current = () => {};
        try {
            const close = await openMic((samples) => {
                if (!micOn.current || ws.readyState !== WebSocket.OPEN) return;
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
    return {
        state,
        speed,
        paused,
        changeSpeed,
        pause,
        mic,
        toggleMic,
        ready,
        notice,
        asked: asked || messages.some((m) => m.board),
        caption: caption ?? restored,
        items,
        marks,
        ask,
        draw,
    };
}
