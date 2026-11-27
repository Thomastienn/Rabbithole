import { useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { IconButton } from '@astryxdesign/core/IconButton';
import { ChatComposer, ChatComposerInput, ChatSendButton } from '@astryxdesign/core/Chat';
import {
    ChevronLeftIcon,
    ChevronRightIcon,
    ExclamationTriangleIcon,
    MicrophoneIcon,
    PencilIcon,
} from '@heroicons/react/24/outline';
import { holdEnter } from '../chat/Attachments';
import type { Message } from '../chat/turn';
import { useBoard, type Drawn } from './useBoard';
import BoardItem, { strokePath } from './BoardItem';
import { follow } from './camera';
import { labelRows } from './player';
import { inkStyle } from '../map/treeList';

type Point = [number, number];
// Where the pointer is on the board, 1600 pixels wide with one 900-pixel area per clear, so its box scales evenly.
function boardPoint(e: PointerEvent<SVGSVGElement>): Point {
    const r = e.currentTarget.getBoundingClientRect();
    const scale = 1600 / r.width;
    return [Math.round((e.clientX - r.left) * scale), Math.round((e.clientY - r.top) * scale)];
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
        // An earlier reply's board is only looked at; strokes go on the latest one.
        if (!pen || board.stepped) return;
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
    const scene = sceneOf(board.items);
    const scroller = useRef<HTMLDivElement>(null);
    const [scrolled, setScrolled] = useState(0);
    // The view follows the area the tutor draws in (src/board/camera.ts).
    useLayoutEffect(() => {
        if (scroller.current) return follow(scroller.current, board.items.at(-1));
    }, [board.items.length, board.at]);
    const rows = labelRows(board.items.map((drawn) => drawn.op));
    const submit = (text: string) => {
        if (busy || !text.trim()) return;
        if (board.ask(text.trim())) setDraft('');
    };
    return (
        <section className="board-column" aria-label="Board" style={inkStyle(ink)}>
            <div className="board-field">
                <div className={`board${pen ? ' pen-on' : ''}`}>
                    <div
                        className="board-scroller"
                        ref={scroller}
                        onScroll={(e) => {
                            const el = e.currentTarget;
                            setScrolled(el.scrollTop / (el.scrollHeight - el.clientHeight || 1));
                        }}
                    >
                        <svg
                            viewBox={`0 0 1600 ${scene.areas * 900}`}
                            role="img"
                            aria-label={
                                board.stepped ? `Board after reply ${board.at + 1}` : 'Board'
                            }
                            onPointerDown={penDown}
                            onPointerMove={penMove}
                            onPointerUp={penUp}
                            onPointerCancel={penUp}
                        >
                            {Array.from({ length: scene.areas - 1 }, (_, i) => (
                                <path
                                    key={i}
                                    className="board-seam"
                                    d={`M0 ${(i + 1) * 900}H1600`}
                                />
                            ))}
                            {scene.shown.map(({ op, ms }) => (
                                <BoardItem
                                    key={op.id}
                                    op={op}
                                    ms={ms}
                                    gone={scene.erased.get(op.id)}
                                    row={rows.get(op.id)}
                                />
                            ))}
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
                    </div>
                    {scene.areas > 1 && (
                        <span
                            className="board-thumb"
                            style={
                                { '--areas': scene.areas, '--scrolled': scrolled } as CSSProperties
                            }
                        />
                    )}
                    {board.replies > 1 && (
                        <div className="board-steps" role="group" aria-label="Board at each reply">
                            <IconButton
                                label="Board after the previous reply"
                                icon={<ChevronLeftIcon />}
                                variant="ghost"
                                size="sm"
                                isDisabled={busy || board.at === 0}
                                onClick={() => board.go(board.at - 1)}
                            />
                            <span>
                                Reply {board.at + 1} of {board.replies}
                            </span>
                            <IconButton
                                label="Board after the next reply"
                                icon={<ChevronRightIcon />}
                                variant="ghost"
                                size="sm"
                                isDisabled={busy || !board.stepped}
                                onClick={() => board.go(board.at + 1)}
                            />
                        </div>
                    )}
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

// What the board shows of its items: highlights under the rest, erased items fading out (or gone when replayed),
// no pointer once its moment has passed, and one 1600×900 area per clear.
function sceneOf(items: Drawn[]) {
    const erased = new Map(
        items.flatMap(({ op, ms }) => (op.ids ?? []).map((id) => [id, ms] as const)),
    );
    const shown = items
        .filter(({ op, ms }) => {
            if (op.kind === 'erase' || op.kind === 'clear') return false;
            return erased.get(op.id) !== 0 && (op.kind !== 'pointer' || ms > 0);
        })
        .sort((a, b) => +(b.op.kind === 'highlight') - +(a.op.kind === 'highlight'));
    return { shown, erased, areas: 1 + items.filter(({ op }) => op.kind === 'clear').length };
}
