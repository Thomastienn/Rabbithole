import { useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
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
import { useBoard } from './useBoard';
import BoardItem, { strokePath } from './BoardItem';
import { labelRows } from './player';
import { DEFAULT_SPEED } from './voice';
import { BOARD_SPEEDS } from '../shell/preferences';
import { componentParts } from './layout';
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
    const ops = board.items.map((drawn) => drawn.op);
    const rows = labelRows(ops);
    const parts = componentParts(ops);
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
                    <svg
                        ref={svg}
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
                                parts={parts.get(op.id)}
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
                                // Typing stays open while the tutor speaks; only Enter waits for it to finish.
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
