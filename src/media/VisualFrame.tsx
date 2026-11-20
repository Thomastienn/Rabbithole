import { useEffect, useRef, useState } from 'react';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { IconButton } from '@astryxdesign/core/IconButton';
import { DropdownMenu } from '@astryxdesign/core/DropdownMenu';
import { Dialog } from '@astryxdesign/core/Dialog';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Badge } from '@astryxdesign/core/Badge';
import { HStack } from '@astryxdesign/core/Layout';
import { useTheme } from '@astryxdesign/core/theme';
import {
    EllipsisHorizontalIcon,
    ExclamationTriangleIcon,
    XMarkIcon,
} from '@heroicons/react/24/outline';
import { inkStyle } from '../map/treeList';
import {
    visualMessage,
    type Artifact,
    type PartBox,
    type PartMark,
    type PartNode,
    type VisualPart,
} from './artifacts';
import { visualProgress } from './visualProgress';

export type VisualBranch = VisualPart & { child: string; address?: string; ink?: number };
// box: a picked part's bounds in viewport coordinates, where the ask box floats.
export type Box = { x: number; y: number; width: number; height: number };
// The Ask button's box picks parts from the keyboard: show outlines the part at a path of tree indexes
// ([] while picking with none focused, undefined once picking ends); listen receives the part tree.
type TreeListener = (parts: PartNode[], step: number | null) => void;
export type PartPicker = { show: (path?: number[]) => void; listen: (set: TreeListener) => void };
export type PartAction = (
    artifact: Artifact,
    part: VisualPart,
    origin: React.RefObject<HTMLElement | null>,
    box?: Box,
    picker?: PartPicker,
) => void;

// Generated code runs only in this frame: scripts without allow-same-origin give it an opaque origin.
// inks: each branched part's family ink, keyed by its trail as JSON; reveal: the part returned to.
function Frame({
    artifact,
    onPick,
    inks = {},
    reveal,
    focus,
    onTree,
}: {
    artifact: Artifact;
    onPick?: (part: VisualPart, box: Box) => void;
    inks?: Record<string, number>;
    reveal?: VisualPart;
    focus?: number[];
    onTree?: TreeListener;
}) {
    const frame = useRef<HTMLIFrameElement>(null);
    const [height, setHeight] = useState<number>();
    // The smallest visual part under the pointer, outlined by the host over the frame.
    const [hover, setHover] = useState<PartBox>();
    // Branched parts the visual currently draws, each outlined in its family ink.
    const [marked, setMarked] = useState<PartMark[]>([]);
    const [tree, setTree] = useState<PartNode[]>([]);
    const treeTo = useRef(onTree);
    treeTo.current = onTree;
    const revealing = useRef<string>(undefined);
    const pick = useRef(onPick);
    pick.current = artifact.status === 'ready' ? onPick : undefined;
    const loaded = useRef(false);
    const { mode, name } = useTheme();
    const post = (data: object) => frame.current?.contentWindow?.postMessage(data, '*');
    // The frame inherits nothing from the app, so it receives the current theme tokens; light-dark() values resolve from the scheme.
    const theme = () => {
        const style = getComputedStyle(frame.current!),
            tokens: Record<string, string> = {};
        for (const name of style)
            if (name.startsWith('--')) tokens[name] = style.getPropertyValue(name).trim();
        post({ type: 'theme', scheme: mode, tokens });
    };
    useEffect(() => {
        function receive(event: MessageEvent) {
            if (!frame.current || event.source !== frame.current.contentWindow) return;
            const el = frame.current,
                message = visualMessage(event.data, {
                    width: el.clientWidth,
                    height: el.clientHeight,
                });
            if (message?.type === 'height') setHeight(message.height);
            if (message?.type === 'marks') setMarked(message.marks);
            if (message?.type === 'tree') {
                setTree(message.parts);
                treeTo.current?.(message.parts, message.step);
            }
            if (!pick.current) return;
            if (message?.type === 'leave') setHover(undefined);
            if (message?.type === 'part') setHover(message.parts.at(-1));
            if (message?.type === 'pick') {
                const { name, x, y, width, height } = message.parts.at(-1)!,
                    at = el.getBoundingClientRect();
                pick.current(
                    {
                        label: name,
                        explanation: artifact.description,
                        trail: message.parts.map((p) => p.name),
                        step: message.step,
                    },
                    { x: at.left + x, y: at.top + y, width, height },
                );
            }
        }
        addEventListener('message', receive);
        return () => removeEventListener('message', receive);
    }, []);
    useEffect(() => {
        if (frame.current) theme();
    }, [mode, name]);
    // The frame sends its part tree only while the ask box picks from the keyboard.
    const picking = focus !== undefined;
    useEffect(() => {
        if (loaded.current) post({ type: 'tree', watch: picking });
    }, [picking]);
    let level = tree,
        focused: PartNode | undefined;
    for (const i of focus ?? []) {
        focused = level[i];
        level = focused?.parts ?? [];
    }
    // The part focused from the keyboard outlines like the hovered one.
    const shown = focused ?? hover;
    const trails = JSON.stringify(Object.keys(inks));
    const postMarks = () =>
        post({ type: 'marks', trails: Object.keys(inks).map((t) => JSON.parse(t)) });
    useEffect(() => {
        if (loaded.current) postMarks();
    }, [trails]);
    // Returning to a branched part opens the visual at its stored step and scrolls its rectangle into view.
    const postStep = () =>
        typeof reveal?.step === 'number' && post({ type: 'step', step: reveal.step });
    const revealKey = reveal?.trail && JSON.stringify(reveal);
    useEffect(() => {
        revealing.current = reveal?.trail && JSON.stringify(reveal.trail);
        if (loaded.current) postStep();
    }, [revealKey]);
    // The frame scales its visual down to the room it has: the viewer's free height, else its scroll area's.
    const room = useRef(0);
    const fit = () => {
        const el = frame.current;
        if (!el || height === undefined) return;
        const dialog = el.closest('dialog'),
            { innerHeight } = el.ownerDocument.defaultView!;
        let box = el.parentElement;
        while (box && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement;
        // Sticky bars such as the composer cover part of the scroll area; 48px leaves the badge row in view.
        const covered = [...(box?.children ?? [])]
            .filter((child) => getComputedStyle(child).position === 'sticky')
            .reduce((sum, child) => sum + child.getBoundingClientRect().height, 0);
        const next = Math.floor(
            dialog
                ? innerHeight - 32 - (dialog.offsetHeight - el.offsetHeight)
                : (box?.clientHeight ?? innerHeight) - covered - 48,
        );
        if (next === room.current) return;
        room.current = next;
        post({ type: 'fit', room: next });
    };
    useEffect(fit, [height]);
    useEffect(() => {
        addEventListener('resize', fit);
        return () => removeEventListener('resize', fit);
    });
    const render = () => {
        post({
            type: 'render',
            source: artifact.source ?? '',
            complete: artifact.status === 'ready',
        });
    };
    useEffect(() => {
        if (loaded.current) render();
    }, [artifact.source, artifact.status]);
    const ready = height !== undefined && (artifact.status === 'ready' || !!artifact.source);
    return (
        <>
            {!ready && <Skeleton className="visual-shimmer" />}
            <iframe
                ref={frame}
                className="visual-frame"
                src="/sandbox.html"
                sandbox="allow-scripts"
                title={artifact.description}
                style={ready ? { height } : undefined}
                data-ready={ready || undefined}
                // A partly drawn visual takes no pointer or keyboard input until it finishes.
                inert={artifact.status === 'pending'}
                onLoad={() => {
                    theme();
                    loaded.current = true;
                    render();
                    postMarks();
                    postStep();
                }}
            />
            {frame.current &&
                marked.map((m) => {
                    const key = JSON.stringify(m.trail),
                        ink = inks[key];
                    // 3px outside the part's bounds, so the line never covers it.
                    return (
                        ink !== undefined && (
                            <span
                                key={key}
                                className="visual-mark"
                                aria-hidden
                                ref={
                                    key === revealing.current
                                        ? (el) => {
                                              if (!el) return;
                                              el.scrollIntoView({ block: 'nearest' });
                                              revealing.current = undefined;
                                          }
                                        : undefined
                                }
                                style={{
                                    ...inkStyle(ink),
                                    left: frame.current!.offsetLeft + m.x - 3,
                                    top: frame.current!.offsetTop + m.y - 3,
                                    width: m.width + 6,
                                    height: m.height + 6,
                                }}
                            />
                        )
                    );
                })}
            {shown && frame.current && (
                <span
                    className="visual-part"
                    aria-hidden
                    data-inside={shown.y < 24 || undefined}
                    style={{
                        left: frame.current.offsetLeft + shown.x,
                        top: frame.current.offsetTop + shown.y,
                        width: shown.width,
                        height: shown.height,
                    }}
                >
                    <span className="visual-part-name">{shown.name}</span>
                </span>
            )}
        </>
    );
}

export default function VisualFrame({
    artifact,
    reveal,
    explored = [],
    onOpenChild,
    onPart,
    onRetry,
    onRegenerate,
}: {
    artifact: Artifact;
    explored?: VisualBranch[];
    onOpenChild?: (id: string) => void;
    reveal?: VisualPart;
    onPart?: PartAction;
    onRetry?: () => Promise<void>;
    onRegenerate?: () => Promise<void>;
}) {
    const [enlarged, setEnlarged] = useState(false);
    const [retried, setRetried] = useState(false);
    const [now, setNow] = useState(Date.now);
    // Where a click on a still-drawing visual landed, to say there why it does not respond.
    const [nudge, setNudge] = useState<number | null>(null);
    const drawing = artifact.status === 'pending';
    useEffect(() => {
        if (!drawing) return;
        setNow(Date.now());
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [drawing]);
    useEffect(() => {
        if (nudge === null) return;
        const timer = setTimeout(() => setNudge(null), 2400);
        return () => clearTimeout(timer);
    }, [nudge]);
    const progress = visualProgress(artifact, now);
    // A part branched more than once keeps the ink of its first listed branch.
    const inks: Record<string, number> = {};
    for (const b of explored) if (b.trail) inks[JSON.stringify(b.trail)] ??= b.ink ?? 0;
    const figure = useRef<HTMLElement>(null);
    const viewer = useRef<HTMLDialogElement>(null);
    const askButton = useRef<HTMLButtonElement>(null);
    const [focus, setFocus] = useState<number[]>();
    const listener = useRef<TreeListener>(undefined);
    const revealKey = reveal && JSON.stringify(reveal);
    // Returning to a visual's source shows the whole figure; tagged parts no longer take focus.
    useEffect(() => {
        if (!revealKey) return;
        figure.current?.scrollIntoView({ block: 'center' });
        figure.current?.focus();
    }, [revealKey]);
    // The whole visual is the source: the existing visual-part request with its title and description.
    // Its box picks parts from the keyboard, and Esc returns to the Ask button.
    const ask =
        onPart &&
        (() =>
            onPart(
                artifact,
                { label: artifact.title, explanation: artifact.description },
                askButton,
                undefined,
                { show: setFocus, listen: (set) => (listener.current = set) },
            ));
    useEffect(() => {
        if (retried && artifact.status === 'ready' && document.activeElement === document.body)
            figure.current?.focus();
    }, [retried, artifact.status]);
    async function run(action: () => Promise<void>) {
        setRetried(true);
        await action();
        requestAnimationFrame(() => {
            if (document.activeElement === document.body)
                (figure.current?.querySelector<HTMLElement>('button') ?? figure.current)?.focus();
        });
    }
    if (!progress) return null;
    const announcement =
        progress.state === 'drawing'
            ? `Drawing visual: ${artifact.title}`
            : progress.state === 'interactive'
              ? `Visual ready: ${artifact.title}`
              : `Visual unavailable. ${artifact.error ?? ''}`;
    return (
        <figure
            ref={figure}
            className="visual"
            tabIndex={-1}
            aria-label={artifact.description}
            data-artifact={artifact.id}
            data-state={artifact.status}
            data-partial={progress.partial || undefined}
            aria-busy={drawing || undefined}
            // The inert frame passes clicks through to the figure.
            onClick={
                drawing
                    ? (event) =>
                          setNudge(event.clientY - event.currentTarget.getBoundingClientRect().top)
                    : undefined
            }
        >
            {/* One persistent live region, so each state change is announced; the visible badge stays quiet. */}
            <Text className="sr-only" role="status">
                {announcement}
            </Text>
            <Badge
                className="visual-badge"
                aria-hidden
                variant={
                    progress.state === 'interactive'
                        ? 'success'
                        : progress.state === 'drawing'
                          ? 'info'
                          : 'error'
                }
                label={
                    progress.state === 'drawing'
                        ? `Drawing… ${progress.elapsed}`
                        : progress.state === 'interactive'
                          ? 'Interactive'
                          : progress.state === 'failed'
                            ? 'Failed'
                            : 'Interrupted'
                }
            />
            {drawing && <span className="visual-drawing-ring" aria-hidden />}
            {(artifact.status === 'pending' || artifact.status === 'ready') && (
                <Frame
                    key={artifact.id}
                    artifact={artifact}
                    inks={inks}
                    reveal={reveal}
                    focus={focus}
                    onTree={(parts, step) => listener.current?.(parts, step)}
                    onPick={onPart && ((part, box) => onPart(artifact, part, figure, box))}
                />
            )}
            {drawing && nudge !== null && (
                <Text className="visual-nudge" aria-hidden style={{ top: nudge }}>
                    Still drawing. Its controls work once it finishes.
                </Text>
            )}
            {artifact.status === 'ready' && artifact.source && (
                <>
                    <HStack className="visual-actions" gap={1} vAlign="center">
                        {ask && (
                            <Button
                                ref={askButton}
                                className="visual-ask"
                                label="Ask"
                                aria-label={`Ask about visual: ${artifact.title}`}
                                variant="ghost"
                                size="sm"
                                onClick={ask}
                            />
                        )}
                        <DropdownMenu
                            presentation="popover"
                            alignment="end"
                            renderTrigger={(props) => (
                                <IconButton
                                    {...props}
                                    label={`Visual actions: ${artifact.title}`}
                                    tooltip="More actions"
                                    icon={<EllipsisHorizontalIcon />}
                                    variant="ghost"
                                    size="sm"
                                />
                            )}
                            items={[
                                ...(onRegenerate
                                    ? [
                                          {
                                              label: 'Try a different version',
                                              onClick: () => void run(onRegenerate),
                                          },
                                      ]
                                    : []),
                                { label: 'Enlarge', onClick: () => setEnlarged(true) },
                            ]}
                        />
                    </HStack>
                    {enlarged && (
                        <Dialog
                            ref={viewer}
                            className="visual-viewer"
                            isOpen
                            onOpenChange={setEnlarged}
                            width="min(64rem, calc(100vw - 2rem))"
                            maxHeight="calc(100dvh - 2rem)"
                            aria-label={artifact.title}
                        >
                            {/* Frame keystrokes do not reach the dialog's focus trap; guards catch either boundary. */}
                            <span
                                tabIndex={0}
                                className="sr-only"
                                aria-hidden
                                onFocus={() => viewer.current?.querySelector('iframe')?.focus()}
                            />
                            <IconButton
                                data-autofocus=""
                                className="viewer-close"
                                label="Close visual"
                                icon={<XMarkIcon />}
                                variant="ghost"
                                size="sm"
                                onClick={() => setEnlarged(false)}
                            />
                            <h2>{artifact.title}</h2>
                            <p>{artifact.description}</p>
                            {ask && (
                                <Button
                                    label="Ask"
                                    aria-label={`Ask about visual: ${artifact.title}`}
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => {
                                        setEnlarged(false);
                                        ask();
                                    }}
                                />
                            )}
                            <Frame
                                artifact={artifact}
                                inks={inks}
                                // The ask box opens beside the figure once the enlarged view closes.
                                onPick={
                                    onPart &&
                                    ((part) => {
                                        setEnlarged(false);
                                        onPart(artifact, part, figure);
                                    })
                                }
                            />
                            <span
                                tabIndex={0}
                                className="sr-only"
                                aria-hidden
                                onFocus={() => viewer.current?.querySelector('button')?.focus()}
                            />
                        </Dialog>
                    )}
                </>
            )}
            {onOpenChild && explored.some((b) => b.address) && (
                <HStack
                    className="visual-chips"
                    gap={1}
                    wrap="wrap"
                    role="group"
                    aria-label="Branches from this visual"
                >
                    {explored
                        .filter((b) => b.address)
                        .sort((a, b) =>
                            a.address!.localeCompare(b.address!, undefined, { numeric: true }),
                        )
                        .map((b) => (
                            <button
                                key={b.child}
                                type="button"
                                className="passage-address"
                                style={inkStyle(b.ink ?? 0)}
                                aria-label={`Open branch ${b.address}: ${b.label}`}
                                onClick={() => onOpenChild(b.child)}
                            >
                                {b.address}
                            </button>
                        ))}
                </HStack>
            )}
            {artifact.status === 'failed' && (
                <ExclamationTriangleIcon className="failure-icon" aria-hidden />
            )}
            {(artifact.status === 'failed' || artifact.status === 'interrupted') && (
                <Text display="block" type="supporting" aria-hidden>
                    Visual unavailable. {artifact.error ?? ''}
                </Text>
            )}
            {onRetry &&
                (artifact.status === 'failed' || (retried && artifact.status === 'pending')) && (
                    <Button
                        key="retry"
                        label="Retry visual"
                        variant="secondary"
                        size="sm"
                        isLoading={artifact.status === 'pending'}
                        clickAction={() => run(onRetry)}
                    />
                )}
        </figure>
    );
}
