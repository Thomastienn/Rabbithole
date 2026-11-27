import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
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
    InformationCircleIcon,
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
import { follow, slide } from './camera';
import PageStrip, { BackChip, pagesOf } from './PageStrip';
import { labelRows } from './player';
import { dimmed } from './spotlight';
import { DEFAULT_SPEED } from './voice';
import { BOARD_SPEEDS } from '../shell/preferences';
import { componentParts } from './layout';
import { inkStyle } from '../map/treeList';

type Point = [number, number];
// Where the pointer is on the board, 1600 pixels wide with one 900-pixel page below another, so its box scales evenly.
function boardPoint(e: PointerEvent<SVGSVGElement>): Point {
    const r = e.currentTarget.getBoundingClientRect();
    const scale = 1600 / r.width;
    return [Math.round((e.clientX - r.left) * scale), Math.round((e.clientY - r.top) * scale)];
}

const STATES = { thinking: 'Thinking', speaking: 'Speaking' } as const;
const MB = (bytes = 0) => Math.round(bytes / 1e6);
// How long a page the learner opens takes to slide in.
const VIEW_MS = 400;

// The board column (mockup Rabbithole-brd.1): the board field, the caption line and the board's composer.
// The tutor's sentences show one at a time as the caption while their ops draw (mockup Rabbithole-brd.2).
// With the pen on, the learner draws on the board in the conversation's ink (mockup Rabbithole-brd.14).
// Speed and pause sit in the board's tools (mockup Rabbithole-brd.8).
// The mic turns on voice questions, downloading the speech models on its first press (mockup Rabbithole-brd.11);
// with push-to-talk on, it is held instead (mockup Rabbithole-brd.12).
// The transcript rail beside it lists what was said; collapsed, the caption line carries the sentence (mockup Rabbithole-brd.15).
export default function Board({
    conversation,
    messages,
    reload,
    thread,
    ink = 0,
    first,
    askedFirst,
}: {
    conversation: string;
    messages: Message[];
    reload: () => void;
    thread: ThreadProps;
    ink?: number;
    // A tree started on the board: its first question, asked once the board connects.
    first?: string;
    askedFirst?: () => void;
}) {
    const board = useBoard(conversation, messages, reload);
    useEffect(() => {
        if (first && board.ready && board.ask(first)) askedFirst?.();
    }, [first, board.ready]);
    const [draft, setDraft] = useState('');
    // Typing an answer holds a tutor's question open (mockup Rabbithole-brd.13).
    const changeDraft = (text: string) => {
        if (text.trim() && !draft.trim()) board.typing();
        setDraft(text);
    };
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
    // The page on screen: the one the learner opened, else the open page (mockup Rabbithole-pgs.4).
    const { pages, open } = pagesOf(board.items.map((drawn) => drawn.op));
    const onScreen = pages.find((p) => p.id === board.view) ?? pages.find((p) => p.id === open);
    const top = onScreen?.top ?? 0;
    const parent = pages.find((p) => p.id === onScreen?.parent);
    const lit = onScreen?.id === open ? board.lit : undefined;
    const scroller = useRef<HTMLDivElement>(null);
    const followed = useRef<number>(undefined);
    // The view follows the page the tutor draws on (src/board/camera.ts); an item that moves no page leaves it be,
    // so a slide the learner started runs on.
    useLayoutEffect(() => {
        const last = board.items.at(-1);
        if (!scroller.current || (top === followed.current && !last?.ms)) return;
        followed.current = top;
        return follow(scroller.current, last, top);
    }, [board.items.length, board.at]);
    // A page the learner opens slides in as a tutor's open does.
    useLayoutEffect(() => {
        if (!scroller.current || !board.view) return;
        followed.current = top;
        return slide(scroller.current, top, VIEW_MS);
    }, [board.view]);
    const rows = labelRows(board.items.map((drawn) => drawn.op));
    const parts = componentParts(scene.shown.map((drawn) => drawn.op));
    const { mic } = board;
    const percent = mic.total ? Math.floor(((mic.loaded ?? 0) * 100) / mic.total) : 0;
    const loading = mic.status === 'loading';
    const ptt = board.pushToTalk;
    const held = ptt && !!mic.hearing;
    const column = useRef<HTMLElement>(null);
    const holdHandlers = {
        onPointerDown: (e: PointerEvent<HTMLElement>) => {
            e.currentTarget.setPointerCapture?.(e.pointerId);
            board.hold(true);
        },
        onPointerUp: () => board.hold(false),
        onPointerCancel: () => board.hold(false),
    };
    const hold = useRef(board.hold);
    hold.current = board.hold;
    // Push-to-talk: Space holds to talk unless focus is in a text field or the board is out of sight.
    useEffect(() => {
        if (!ptt) return;
        const key = (down: boolean) => (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (e.code !== 'Space' || column.current?.closest('[hidden]')) return;
            if (
                target.closest?.(
                    'input, textarea, select, [contenteditable]:not([contenteditable=false])',
                )
            )
                return;
            e.preventDefault();
            if (!e.repeat) hold.current(down);
        };
        const down = key(true),
            up = key(false),
            blur = () => hold.current(false);
        window.addEventListener('keydown', down);
        window.addEventListener('keyup', up);
        window.addEventListener('blur', blur);
        return () => {
            window.removeEventListener('keydown', down);
            window.removeEventListener('keyup', up);
            window.removeEventListener('blur', blur);
            hold.current(false);
        };
    }, [ptt]);
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
            ...(t.user
                ? [{ id: t.user, role: 'user', text: t.question, status: 'completed', board: true }]
                : []),
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
            ref={column}
            className={`board-column${railOpen ? '' : ' rail-shut'}`}
            aria-label="Board"
            style={inkStyle(ink)}
        >
            <div className="board-field">
                <div className="board-stack">
                    <PageStrip pages={pages} current={onScreen?.id} open={board.openPage} />
                    <div className={`board${pen ? ' pen-on' : ''}${board.paused ? ' paused' : ''}`}>
                        <div className="board-scroller" ref={scroller}>
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
                                        dim={dimmed(op, lit)}
                                    />
                                ))}
                                {/* The tutor heard, or waits for the learner's answer: a soft pulse in the corner of the open page, which board items rarely use. */}
                                {(board.state === 'thinking' || board.waiting) && (
                                    <circle
                                        className="board-waiting"
                                        cx={1544}
                                        cy={top + 844}
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
                        {parent && <BackChip parent={parent} open={board.openPage} />}
                        {board.replies > 1 && (
                            <div
                                className="board-steps"
                                role="group"
                                aria-label="Board at each reply"
                            >
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
                        {loading && !board.notice && (
                            <p className="board-notice info" role="status">
                                <InformationCircleIcon aria-hidden />
                                Getting voice ready: {MB(mic.loaded)} of {MB(mic.total)} MB. Your
                                voice stays on this computer.
                            </p>
                        )}
                        {board.notice && (
                            <p className="board-notice" role="alert">
                                <ExclamationTriangleIcon aria-hidden />
                                {board.notice}
                            </p>
                        )}
                    </div>
                </div>
            </div>
            <div className="board-line">
                <span role="status">
                    {board.paused ? (
                        <span className="board-state paused">Paused</span>
                    ) : held ? (
                        <span className="board-state listening">Listening</span>
                    ) : board.state !== 'idle' ? (
                        <span className={`board-state ${board.state}`}>{STATES[board.state]}</span>
                    ) : (
                        mic.status === 'on' &&
                        !ptt && <span className="board-state listening">Listening</span>
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
                    onChange={changeDraft}
                    onSubmit={submit}
                    sendButton={
                        busy ? <ChatSendButton isDisabled className="board-send-busy" /> : undefined
                    }
                    footerActions={
                        <span className="board-tools">
                            {/* Off when a board opens; downloading and hearing widen it to the icon's right. */}
                            {ptt && !loading ? (
                                // Push-to-talk (mockup Rabbithole-brd.12): a hold button, never a toggle.
                                <Button
                                    className="board-mic ptt"
                                    label="Hold to talk"
                                    aria-pressed={held}
                                    aria-keyshortcuts="Space"
                                    icon={<MicrophoneIcon />}
                                    variant="ghost"
                                    isDisabled={!board.ready}
                                    {...holdHandlers}
                                >
                                    {held ? (
                                        <>
                                            Release to send
                                            <span className="board-level" aria-hidden>
                                                {mic.levels?.map((h, i) => (
                                                    <s key={i} style={{ height: `${h * 16}px` }} />
                                                ))}
                                            </span>
                                        </>
                                    ) : (
                                        <>
                                            Hold to talk<kbd>Space</kbd>
                                        </>
                                    )}
                                </Button>
                            ) : (
                                <Button
                                    className={`board-mic${loading ? ' load' : mic.hearing ? ' hear' : ''}`}
                                    label={
                                        loading
                                            ? `${ptt ? 'Hold to talk' : 'Turn mic on'}, downloading ${percent}%`
                                            : 'Turn mic on'
                                    }
                                    aria-pressed={mic.status === 'on'}
                                    aria-busy={loading || undefined}
                                    icon={<MicrophoneIcon />}
                                    isIconOnly={!loading && !mic.hearing}
                                    variant="ghost"
                                    isDisabled={!board.ready}
                                    // Downloading on a first hold, it is still held, never toggled.
                                    {...(ptt ? holdHandlers : { onClick: board.toggleMic })}
                                >
                                    {loading ? (
                                        <>
                                            {percent}%
                                            <span className="board-mic-bar">
                                                <b style={{ width: `${percent}%` }} />
                                            </span>
                                        </>
                                    ) : (
                                        mic.hearing && (
                                            <span className="board-level" aria-hidden>
                                                {mic.levels?.map((h, i) => (
                                                    <s key={i} style={{ height: `${h * 16}px` }} />
                                                ))}
                                            </span>
                                        )
                                    )}
                                </Button>
                            )}
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
                                onChange={changeDraft}
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
// no pointer once its moment has passed, and one 1600×900 space per page.
function sceneOf(items: Drawn[]) {
    const erased = new Map(
        items.flatMap(({ op, ms }) => (op.ids ?? []).map((id) => [id, ms] as const)),
    );
    const shown = items
        .filter(({ op, ms }) => {
            if (op.kind === 'erase' || op.top !== undefined) return false;
            return erased.get(op.id) !== 0 && (op.kind !== 'pointer' || ms > 0);
        })
        .sort((a, b) => +(b.op.kind === 'highlight') - +(a.op.kind === 'highlight'));
    const areas = 1 + Math.max(0, ...items.map(({ op }) => (op.top ?? 0) / 900));
    return { shown, erased, areas };
}
