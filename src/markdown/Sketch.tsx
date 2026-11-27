import {
    createContext,
    useContext,
    useEffect,
    useId,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type CSSProperties,
} from 'react';
import { HStack } from '@astryxdesign/core/Layout';
import { drawSketch, sketchPassage, type Palette, type Sketch as Drawing } from '../sketch/sketch';
import type { Anchor } from '../chat/branch';
import { inkStyle } from '../map/treeList';
import './sketch.css';

// Theme tokens by role (mockup Rabbithole-skt.1). As CSS variables, a theme switch recolours every sketch.
const THEME: Palette = {
    ground: 'var(--color-background-body)',
    ink: 'var(--color-text-primary)',
    muted: 'var(--color-text-secondary)',
    seam: 'var(--color-border-emphasized)',
    focus: 'var(--rabbithole-paper)',
};

export type SketchBranch = {
    start: number;
    end: number;
    label: string;
    child: string;
    address?: string;
    ink?: number;
};
// A reply's way to ask about its sketch items (mockup Rabbithole-skt.6); without one, sketches only draw.
export const SketchAsk = createContext<{
    ask: (anchor: Anchor, origin: React.RefObject<HTMLElement | null>) => void;
    messageId: string;
    // The open ask box's anchor, and the branches already asked from this reply's sketches.
    open?: Anchor;
    branches: SketchBranch[];
    openChild: (id: string) => void;
} | null>(null);

// A sketch block in a reply: a placeholder while its fence is open, nothing (logged) when it cannot draw.
// One that arrives in a streaming reply builds in item by item, like the text around it; a saved reply's shows at once.
export default function Sketch({
    kind,
    body,
    fence,
    live,
    start,
    end,
}: {
    kind: string;
    body: string;
    fence: 'open' | 'closed' | 'unfinished';
    live: boolean;
    start: number;
    end: number;
}) {
    const sketch = useMemo(
        () => (fence === 'closed' ? drawSketch(kind, body, THEME) : undefined),
        [kind, body, fence],
    );
    const error =
        fence === 'unfinished'
            ? 'unclosed fence'
            : sketch && 'error' in sketch
              ? sketch.error
              : undefined;
    useEffect(() => {
        if (error) console.warn(`Sketch hidden (${kind.trim()}): ${error}`);
    }, [kind, error]);
    if (fence === 'open')
        return <div className="sketch-wait" role="status" aria-label="Drawing a sketch" />;
    if (!sketch || 'error' in sketch) return null;
    return <SketchDrawing drawn={sketch} live={live} start={start} end={end} />;
}

function SketchDrawing({
    drawn,
    live,
    start,
    end,
}: {
    drawn: Drawing;
    live: boolean;
    start: number;
    end: number;
}) {
    const [build] = useState(
        () => live && !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    );
    const context = useContext(SketchAsk),
        drawing = useRef<HTMLDivElement>(null),
        buttons = useRef<(HTMLButtonElement | null)[]>([]),
        hint = useId(),
        // The focused item, and the one Tab lands on: the item focused last, else the first.
        [focused, setFocused] = useState<number>(),
        [last, setLast] = useState(0);
    const mine = context?.branches.filter((b) => b.start === start && b.end === end) ?? [],
        open = context?.open,
        openLabel = open?.sketch && open.start === start && open.end === end && open.sketch.label,
        branchOf = (label: string) => mine.find((b) => b.label === label);
    // The drawing is the module's markup, so its items take their state as classes.
    useLayoutEffect(() => {
        drawing.current?.querySelectorAll<HTMLElement>('[data-item]').forEach((el, i) => {
            const label = drawn.items[i]?.label,
                branch = label === undefined ? undefined : branchOf(label);
            el.classList.toggle('open', label === openLabel);
            el.classList.toggle('kf', i === focused);
            el.classList.toggle('mk', !!branch);
            const ink = branch && (inkStyle(branch.ink ?? 0) as Record<string, string>)['--ink'];
            el.style.setProperty('--ink', ink || null);
        });
    });
    // The ask box hangs 4px under the item's hit area, from its left edge, or its right edge in the column's right half.
    function ask(i: number) {
        const hit = drawing.current!.querySelectorAll('[data-item]')[i],
            area = (hit.querySelector('.sketch-hit') ?? hit).getBoundingClientRect(),
            reply = hit.closest('.passage')?.getBoundingClientRect(),
            column = drawing.current!.getBoundingClientRect();
        if (!reply) return;
        const label = drawn.items[i].label;
        context!.ask(
            {
                messageId: context!.messageId,
                start,
                end,
                text: sketchPassage(drawn.title, label),
                sketch: { title: drawn.title, label },
                at: {
                    x: area.left - reply.left,
                    y: area.top - reply.top,
                    below: area.bottom - reply.top,
                    ...(area.left - column.left > column.width / 2 && {
                        right: reply.right - area.right,
                    }),
                },
            },
            { current: buttons.current[i] },
        );
    }
    const chips = mine.filter((b) => b.address);
    return (
        <figure
            className={['sketch', build && 'sketch-build', context && 'askable']
                .filter(Boolean)
                .join(' ')}
            // The items share about 0.5 s: 0.3 s of staggered starts, then each fades for 0.2 s.
            style={
                build
                    ? ({
                          '--step': `${300 / Math.max(drawn.items.length - 1, 1)}ms`,
                          '--fade': '200ms',
                      } as CSSProperties)
                    : undefined
            }
            aria-label={drawn.title ? `Sketch: ${drawn.title}` : 'Sketch'}
        >
            {drawn.title && <figcaption aria-hidden="true">{drawn.title}</figcaption>}
            {/* The module escapes every label the tutor wrote. A click on an item's hit area asks about it. */}
            <div
                ref={drawing}
                aria-hidden="true"
                onClick={(e) => {
                    const hit = (e.target as Element).closest('[data-item]');
                    if (context && hit) ask(Number(hit.getAttribute('data-item')));
                }}
                dangerouslySetInnerHTML={{ __html: drawn.markup }}
            />
            {/* The items, read in order; asking makes each one a button, the sketch one Tab stop that arrows move through. */}
            <ul className="sr-only">
                {drawn.items.map((item, i) => {
                    const address = branchOf(item.label)?.address;
                    return (
                        <li key={i}>
                            {context ? (
                                <button
                                    type="button"
                                    ref={(el) => {
                                        buttons.current[i] = el;
                                    }}
                                    tabIndex={i === last ? 0 : -1}
                                    aria-label={
                                        address ? `${item.text}, branch ${address}` : item.text
                                    }
                                    aria-describedby={hint}
                                    onFocus={() => {
                                        setFocused(i);
                                        setLast(i);
                                    }}
                                    onBlur={() => setFocused(undefined)}
                                    onClick={() => ask(i)}
                                    onKeyDown={(e) => {
                                        const n = drawn.items.length,
                                            to = {
                                                ArrowRight: i + 1,
                                                ArrowDown: i + 1,
                                                ArrowLeft: i - 1,
                                                ArrowUp: i - 1,
                                                Home: 0,
                                                End: n - 1,
                                            }[e.key];
                                        if (to === undefined) return;
                                        e.preventDefault();
                                        buttons.current[Math.max(0, Math.min(n - 1, to))]?.focus();
                                    }}
                                >
                                    {item.text}
                                </button>
                            ) : (
                                item.text
                            )}
                        </li>
                    );
                })}
            </ul>
            {context && (
                <span id={hint} hidden>
                    Press Enter to ask about it.
                </span>
            )}
            {context && chips.length > 0 && (
                <HStack
                    className="visual-chips"
                    gap={1}
                    wrap="wrap"
                    role="group"
                    aria-label="Branches from this sketch"
                >
                    {chips
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
                                onClick={() => context.openChild(b.child)}
                            >
                                {b.address}
                            </button>
                        ))}
                </HStack>
            )}
        </figure>
    );
}
