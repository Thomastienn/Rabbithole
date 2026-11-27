import { useEffect, useRef, useState } from 'react';
import { boardSocket } from '../serverAccess';
import type { Message } from '../chat/turn';
import { boardPlayer } from './player';

export type BoardState = 'idle' | 'thinking' | 'speaking';
type Caption = { text: string; muted: boolean };

// A saved reply joins its sentences with spaces; the caption holds the last one.
const lastSentence = (text: string) =>
    text
        .trim()
        .split(/(?<=[.!?…])\s+/)
        .at(-1) ?? '';

// One open board: its socket to the board session, the caption line and the session state.
// Leaving (unmount) asks the server to save the reply up to the caption shown, then reloads the conversation.
export function useBoard(conversation: string, messages: Message[], reload: () => void) {
    const latest = messages.at(-1);
    const [state, setState] = useState<BoardState>('idle');
    const [ready, setReady] = useState(false);
    const [notice, setNotice] = useState<string>();
    // The empty board's hint shows only before the conversation's first board question.
    const [asked, setAsked] = useState(() => messages.some((m) => m.board));
    const [caption, setCaption] = useState<Caption | undefined>(() =>
        latest?.board && latest.role === 'assistant' && latest.text.trim()
            ? { text: lastSentence(latest.text), muted: true }
            : undefined,
    );
    const socket = useRef<WebSocket>(undefined);
    useEffect(() => {
        const ws = boardSocket(conversation);
        socket.current = ws;
        const send = (message: object) => {
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
        };
        const player = boardPlayer(
            (s) => setCaption({ text: s.text, muted: false }),
            (s, phase) => send({ type: 'progress', sentence: s.id, phase }),
        );
        ws.onopen = () => setReady(true);
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
            if (m.type === 'sentence') player.add(m);
            if (m.type === 'notice') setNotice(m.notice);
        };
        return () => {
            player.stop();
            ws.onmessage = null;
            ws.onclose = reload;
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'leave' }));
                // The server closes once the reply is saved; a stalled one is closed here.
                setTimeout(() => ws.close(), 2000);
            } else ws.close();
        };
    }, [conversation]);
    const ask = (text: string) => {
        socket.current?.send(JSON.stringify({ type: 'ask', text }));
        setAsked(true);
        setNotice(undefined);
        // The sent question shows muted until the tutor speaks, so the learner sees it was heard.
        setCaption({ text, muted: true });
        setState('thinking');
    };
    return { state, ready, notice, asked, caption, ask };
}
