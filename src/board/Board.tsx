import { useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import {
    DropdownMenu,
    DropdownMenuGroup,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
} from '@astryxdesign/core/DropdownMenu';
import { ChatComposer, ChatComposerInput, ChatSendButton } from '@astryxdesign/core/Chat';
import {
    ChevronLeftIcon,
    ChevronRightIcon,
    ExclamationTriangleIcon,
    MicrophoneIcon,
    PauseIcon,
    PencilIcon,
    PlayIcon,
} from '@heroicons/react/24/outline';
import { holdEnter } from '../chat/Attachments';
import type { Message } from '../chat/turn';
import type { ThreadProps } from '../chat/ChatThread';
import TranscriptRail from './TranscriptRail';
import { useBoard, type Drawn } from './useBoard';
import BoardItem, { strokePath } from './BoardItem';
import { follow } from './camera';
import { labelRows } from './player';
import { DEFAULT_SPEED } from './voice';
import { BOARD_SPEEDS } from '../shell/preferences';
import { componentParts } from './layout';
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
// Speed and pause sit in the board's tools (mockup Rabbithole-brd.8).
// The transcript rail beside it lists what was said; collapsed, the caption line carries the sentence (mockup Rabbithole-brd.15).
export default function Board({
    conversation,
    messages,
    reload,
    thread,
    ink = 0,
}: {
    conversation: string;
    messages: Message[];
    reload: () => void;
    thread: ThreadProps;
    ink?: number;
}) {
    const board = useBoard(conversation, messages, reload);
    const [draft, setDraft] = useState('');
    const [railOpen, setRailOpen] = useState(true);
    const [pen, setPen] = useState(false);
    const [line, setLine] = useState<Point[]>();
    const svg = useRef<SVGSVGElement>(null);
    // Item entries are CSS animations in board time; their playback rate carries the speed, mid-entry too.
    useLayoutEffect(() => {
        for (const a of svg.current?.getAnimations?.({ subtree: true }) ?? [])
            a.playbackRate = board.speed / DEFAULT_SPEED;
    }, [board.items, board.speed]);
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
    // Typing never stops the tutor; sending mid-reply cuts in, so only thinking holds the send button.
    const busy = board.state === 'thinking' || !board.ready;
    // Stepping through replies waits for the tutor to finish.
    const tutoring = board.state !== 'idle' || !board.ready;
    const scene = sceneOf(board.items);
    const scroller = useRef<HTMLDivElement>(null);
    const [scrolled, setScrolled] = useState(0);
    // The view follows the area the tutor draws in (src/board/camera.ts).
    useLayoutEffect(() => {
        if (scroller.current) return follow(scroller.current, board.items.at(-1));
    }, [board.items.length, board.at]);
    const rows = labelRows(board.items.map((drawn) => drawn.op));
    const parts = componentParts(scene.shown.map((drawn) => drawn.op));
    const submit = (text: string) => {
        if (busy || !text.trim()) return;
        if (board.ask(text.trim())) setDraft('');
    };
    // The rail: the conversation's turns, then this board's, each reply as far as it was shown.
    const session = new Set(board.turns.flatMap((t) => [t.user, t.reply]));
    const said: Message[] = [
        ...messages
            .filter((m) => !session.has(m.id) && m.text.trim())
            // A board reply left halfway is what was said, so it branches like a completed one.
            .map((m) =>
                m.board && m.status === 'interrupted' ? { ...m, status: 'completed' } : m,
            ),
        ...board.turns.flatMap((t) => [
            { id: t.user, role: 'user', text: t.question, status: 'completed', board: true },
            ...(t.said.length
                ? [
                      {
                          id: t.reply,
                          role: 'assistant',
                          text: t.said.join('\n'),
                          status: 'completed',
                          board: true,
                      },
                  ]
                : []),
        ]),
    ];
    const speaking = board.state === 'speaking' && board.turns.at(-1);
    const now = speaking &&
        speaking.said.length > 0 && {
            id: speaking.reply,
            start: speaking.said.join('\n').length - speaking.said.at(-1)!.length,
            end: speaking.said.join('\n').length,
        };
    // Branching pauses the board at once; a turn in flight is saved up to the sentence shown before the child is made.
    const branchFromRail = (e: React.FormEvent) => {
        e.preventDefault();
        board.pause(true);
        void (board.state === 'idle' ? Promise.resolve() : board.leave()).then(() =>
            thread.submitBranch(e),
        );
    };
    const branch = thread.branch;
    const askHere =
        branch && !busy
            ? () => {
                  thread.closeBranch(false);
                  submit(`${branch.anchor.text.replace(/^/gm, '> ')}\n\n${branch.question}`);
              }
            : undefined;
    return (
        <section
            className={`board-column${railOpen ? '' : ' rail-shut'}`}
            aria-label="Board"
            style={inkStyle(ink)}
        >
            <div className="board-field">
                <div className={`board${pen ? ' pen-on' : ''}${board.paused ? ' paused' : ''}`}>
                    <div
                        className="board-scroller"
                        ref={scroller}
                        onScroll={(e) => {
                            const el = e.currentTarget;
                            setScrolled(el.scrollTop / (el.scrollHeight - el.clientHeight || 1));
                        }}
                    >
                        <svg
                            ref={svg}
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
                                    parts={parts.get(op.id)}
                                />
                            ))}
                            {/* The tutor heard: a soft pulse in the corner of the current area, which board items rarely use, until it speaks. */}
                            {board.state === 'thinking' && (
                                <circle
                                    className="board-waiting"
                                    cx={1544}
                                    cy={(scene.areas - 1) * 900 + 844}
                                    r={10}
                                />
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
                                isDisabled={tutoring || board.at === 0}
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
                                isDisabled={tutoring || !board.stepped}
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
                    {board.paused ? (
                        <span className="board-state paused">Paused</span>
                    ) : (
                        board.state !== 'idle' && (
                            <span className={`board-state ${board.state}`}>
                                {STATES[board.state]}
                            </span>
                        )
                    )}
                </span>
                <p
                    className={`board-caption${board.caption?.muted ? ' muted' : ''}`}
                    aria-live="polite"
                >
                    {!railOpen && board.caption?.text}
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
                            <DropdownMenu
                                presentation="popover"
                                placement="above"
                                alignment="start"
                                menuWidth={180}
                                renderTrigger={(props) => (
                                    <Button
                                        {...props}
                                        className="model-picker board-speed"
                                        label={`Speed, ${board.speed}×`}
                                        variant="ghost"
                                        size="sm"
                                    >
                                        {board.speed}×
                                    </Button>
                                )}
                            >
                                <DropdownMenuGroup title="Speed">
                                    <DropdownMenuRadioGroup
                                        label="Speed"
                                        value={String(board.speed)}
                                        onChange={(value) => board.changeSpeed(Number(value))}
                                    >
                                        {BOARD_SPEEDS.map((s) => (
                                            <DropdownMenuRadioItem
                                                key={s}
                                                value={String(s)}
                                                label={`${s}×`}
                                                endContent={
                                                    s === DEFAULT_SPEED ? 'Default' : undefined
                                                }
                                            />
                                        ))}
                                    </DropdownMenuRadioGroup>
                                </DropdownMenuGroup>
                            </DropdownMenu>
                            <IconButton
                                className="board-pause"
                                label={board.paused ? 'Resume' : 'Pause'}
                                aria-pressed={board.paused}
                                icon={board.paused ? <PlayIcon /> : <PauseIcon />}
                                variant="ghost"
                                isDisabled={!board.paused && board.state !== 'speaking'}
                                onClick={() => board.pause(!board.paused)}
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
                                // Typing stays open while the tutor thinks; only Enter waits for it.
                                onKeyDown={(e) => busy && holdEnter(e)}
                                placeholder="Ask a question"
                            />
                        </>
                    }
                />
            </div>
            <TranscriptRail
                conversation={conversation}
                messages={said}
                now={now || undefined}
                paused={board.paused}
                open={railOpen}
                toggle={() => setRailOpen(!railOpen)}
                thread={thread}
                submit={branchFromRail}
                askHere={askHere}
            />
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
