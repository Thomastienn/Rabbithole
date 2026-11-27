import { useState, type PointerEvent } from 'react';
import { IconButton } from '@astryxdesign/core/IconButton';
import { ChatComposer, ChatComposerInput, ChatSendButton } from '@astryxdesign/core/Chat';
import { ExclamationTriangleIcon, MicrophoneIcon, PencilIcon } from '@heroicons/react/24/outline';
import { holdEnter } from '../chat/Attachments';
import type { Message } from '../chat/turn';
import { useBoard } from './useBoard';
import BoardItem, { strokePath } from './BoardItem';
import { labelRows } from './player';
import { inkStyle } from '../map/treeList';

type Point = [number, number];
// Where the pointer is on the 1600×900 board; the board keeps 16:9, so its box maps straight onto it.
function boardPoint(e: PointerEvent<SVGSVGElement>): Point {
    const r = e.currentTarget.getBoundingClientRect();
    return [
        Math.round(((e.clientX - r.left) * 1600) / r.width),
        Math.round(((e.clientY - r.top) * 900) / r.height),
    ];
}

const STATES = { thinking: 'Thinking', speaking: 'Speaking' } as const;

// The board column (mockup Rabbithole-brd.1): the board field, the caption line and the board's composer.
// The tutor's sentences show one at a time as the caption while their ops draw (mockup Rabbithole-brd.2).
// With the pen on, the learner draws on the board in the conversation's ink (mockup Rabbithole-brd.14).
export default function Board({
    conversation,
    messages,
    reload,
    ink = 0,
}: {
    conversation: string;
    messages: Message[];
    reload: () => void;
    ink?: number;
}) {
    const board = useBoard(conversation, messages, reload);
    const [draft, setDraft] = useState('');
    const [pen, setPen] = useState(false);
    const [line, setLine] = useState<Point[]>();
    const penDown = (e: PointerEvent<SVGSVGElement>) => {
        if (!pen) return;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        setLine([boardPoint(e)]);
    };
    const penMove = (e: PointerEvent<SVGSVGElement>) => {
        if (!line) return;
        const [x, y] = boardPoint(e);
        const [lx, ly] = line.at(-1)!;
        // Points closer than 4 board pixels add nothing visible.
        if (Math.hypot(x - lx, y - ly) >= 4) setLine([...line, [x, y]]);
    };
    const penUp = () => {
        if (line) board.draw(line);
        setLine(undefined);
    };
    const busy = board.state !== 'idle' || !board.ready;
    const rows = labelRows(board.items.map((drawn) => drawn.op));
    const submit = (text: string) => {
        if (busy || !text.trim()) return;
        if (board.ask(text.trim())) setDraft('');
    };
    return (
        <section className="board-column" aria-label="Board" style={inkStyle(ink)}>
            <div className="board-field">
                <div className={`board${pen ? ' pen-on' : ''}`}>
                    <svg
                        viewBox="0 0 1600 900"
                        role="img"
                        aria-label="Board"
                        onPointerDown={penDown}
                        onPointerMove={penMove}
                        onPointerUp={penUp}
                        onPointerCancel={penUp}
                    >
                        {board.items.map(({ op, ms, erased }) => (
                            <BoardItem
                                key={op.id}
                                op={op}
                                ms={ms}
                                erased={erased}
                                row={rows.get(op.id)}
                            />
                        ))}
                        {/* The tutor heard: a soft pulse in the corner, which board items rarely use, until it speaks. */}
                        {board.state === 'thinking' && (
                            <circle className="board-waiting" cx={1544} cy={844} r={10} />
                        )}
                        {line && (
                            <g className="board-item">
                                <path className="board-learner" d={strokePath(line)} />
                                <circle
                                    className="board-tip"
                                    cx={line.at(-1)![0]}
                                    cy={line.at(-1)![1]}
                                    r={8}
                                />
                            </g>
                        )}
                    </svg>
                    {!board.asked && <p className="board-empty">Ask a question to start.</p>}
                    {board.notice && (
                        <p className="board-notice" role="alert">
                            <ExclamationTriangleIcon aria-hidden />
                            {board.notice}
                        </p>
                    )}
                </div>
            </div>
            <div className="board-line">
                <span role="status">
                    {board.state !== 'idle' && (
                        <span className={`board-state ${board.state}`}>{STATES[board.state]}</span>
                    )}
                </span>
                <p
                    className={`board-caption${board.caption?.muted ? ' muted' : ''}`}
                    aria-live="polite"
                >
                    {board.caption?.text}
                </p>
                <span />
            </div>
            <div className="board-foot">
                <ChatComposer
                    className="board-composer"
                    elevation="none"
                    value={draft}
                    onChange={setDraft}
                    onSubmit={submit}
                    sendButton={
                        busy ? <ChatSendButton isDisabled className="board-send-busy" /> : undefined
                    }
                    footerActions={
                        <span className="board-tools">
                            {/* Voice arrives in a later ticket; the mic is off when a board opens. */}
                            <IconButton
                                className="board-mic"
                                label="Turn mic on"
                                aria-pressed={false}
                                icon={<MicrophoneIcon />}
                                variant="ghost"
                                isDisabled
                            />
                            <IconButton
                                className="board-pen"
                                label="Pen"
                                aria-pressed={pen}
                                icon={<PencilIcon />}
                                variant="ghost"
                                onClick={() => setPen(!pen)}
                            />
                        </span>
                    }
                    input={
                        <>
                            {board.marks > 0 && (
                                <div className="board-tray">
                                    <span className="board-marks">
                                        <span aria-hidden />
                                        {board.marks === 1
                                            ? '1 mark goes with your question'
                                            : `${board.marks} marks go with your question`}
                                    </span>
                                </div>
                            )}
                            <ChatComposerInput
                                label="Your question"
                                maxRows={4}
                                value={draft}
                                onChange={setDraft}
                                // Typing stays open while the tutor speaks; only Enter waits for it to finish.
                                onKeyDown={(e) => busy && holdEnter(e)}
                                placeholder="Ask a question"
                            />
                        </>
                    }
                />
            </div>
        </section>
    );
}
