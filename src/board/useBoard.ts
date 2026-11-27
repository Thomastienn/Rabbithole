import { useEffect, useRef, useState } from 'react';
import { boardSocket } from '../serverAccess';
import type { Message } from '../chat/turn';
import { boardPlayer, type Op } from './player';
import { streamedVoice } from './voice';

export type BoardState = 'idle' | 'thinking' | 'speaking';
type Caption = { text: string; muted: boolean };
// A drawn board item and how long its entry takes.
export type Drawn = { op: Op; ms: number };

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
    const restored = latest && { text: latest.text.trim().split('\n').at(-1) ?? '', muted: true };
    const socket = useRef<WebSocket>(undefined);
    useEffect(() => {
        const ws = boardSocket(conversation);
        socket.current = ws;
        const send = (message: object) => {
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
        };
        const player = boardPlayer(
            (s) => setCaption({ text: s.text, muted: false }),
            (op, ms) =>
                setItems((drawn) =>
                    drawn.some((item) => item.op.id === op.id)
                        ? drawn.map((item) => (item.op.id === op.id ? { op, ms } : item))
                        : [...drawn, { op, ms }],
                ),
            (s, phase) => send({ type: 'progress', sentence: s.id, phase }),
            streamedVoice(),
        );
        ws.binaryType = 'arraybuffer';
        ws.onopen = () => setReady(true);
        ws.onclose = () => {
            player.stop();
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
            if (m.type === 'audio-end') player.audioEnd(m.id);
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
        setNotice(undefined);
        // The sent question shows muted until the tutor speaks, so the learner sees it was heard.
        setCaption({ text, muted: true });
        setState('thinking');
        return true;
    };
    return {
        state,
        ready,
        notice,
        asked: asked || messages.some((m) => m.board),
        caption: caption ?? restored,
        items,
        ask,
    };
}
