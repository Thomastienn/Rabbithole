import { useEffect, useRef, useState } from 'react';
import { boardSocket } from '../serverAccess';
import type { Message } from '../chat/turn';
import { boardPlayer, type Op } from './player';

export type BoardState = 'idle' | 'thinking' | 'speaking';
type Caption = { text: string; muted: boolean };
// A drawn board item, how long its entry takes and, once erased, how long its fade takes.
export type Drawn = { op: Op; ms: number; erased?: number };

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
    const socket = useRef<WebSocket>(undefined);
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
            setTimeout(
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
                    : setItems((drawn) => [...drawn, { op, ms }]),
            (s, phase) => send({ type: 'progress', sentence: s.id, phase }),
        );
        ws.onopen = () => setReady(true);
        ws.onclose = () => {
            player.stop();
            setReady(false);
            setState('idle');
            setCaption((c) => c && { ...c, muted: true });
            setNotice('The board disconnected. Turn Board off and on to reconnect.');
        };
        ws.onmessage = (event) => {
            const m = JSON.parse(event.data);
            if (m.type === 'state') {
                setState(m.state);
                // Idle ends the reply: anything not yet shown is dropped and the last caption is held, muted.
                if (m.state === 'idle') {
                    player.stop();
                    setCaption((c) => c && { ...c, muted: true });
                }
            }
            // The saved board shows at once, without entry.
            if (m.type === 'board') setItems(m.items.map((op: Op) => ({ op, ms: 0 })));
            if (m.type === 'sentence') player.add(m);
            if (m.type === 'stroke') {
                setItems((drawn) => [...drawn, { op: m.item, ms: 0 }]);
                if (m.mark) setMarks((n) => n + 1);
            }
            if (m.type === 'notice') setNotice(m.notice);
        };
        return () => {
            player.stop();
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
    return {
        state,
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
