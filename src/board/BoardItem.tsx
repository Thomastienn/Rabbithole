import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import type { Op } from './player';
import type { Part } from './layout';

// Math in KaTeX's own faces, centred on its point (mockup Rabbithole-brd.4). Each top-level group is a term that
// writes in after the one before, sharing the op's time, drawn where it ends up so the formula never shifts.
function BoardMath({ op }: { op: Op }) {
    const [x, y] = op.at!;
    const box = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const terms = box.current!.querySelectorAll<HTMLElement>(
            '.katex-base > :not(.katex-strut, .mspace)',
        );
        box.current!.style.setProperty('--terms', String(terms.length || 1));
        terms.forEach((term, i) => {
            term.classList.add('board-term');
            term.style.setProperty('--term', String(i));
        });
    }, [op.text]);
    return (
        <foreignObject className="board-math-box" x={x - 800} y={y - 300} width={1600} height={600}>
            <div
                ref={box}
                className={`board-math ${op.size ?? 'm'}`}
                // The server only sends math KaTeX parsed (server/board/ops.mjs); trust stays off.
                dangerouslySetInnerHTML={{
                    __html: katex.renderToString(op.text ?? '', {
                        output: 'html',
                        // Display style, so a fraction's parts are full size as in the mockup.
                        displayMode: true,
                        throwOnError: false,
                        strict: 'ignore',
                    }),
                }}
            />
        </foreignObject>
    );
}

// An arrowhead is two strokes 24 board pixels back along the shaft and 18 either side (mockup Rabbithole-brd.2).
function head([x0, y0]: [number, number], [x, y]: [number, number]) {
    const length = Math.hypot(x - x0, y - y0) || 1;
    const [ux, uy] = [(x - x0) / length, (y - y0) / length];
    const [bx, by] = [x - 24 * ux, y - 24 * uy];
    return `M${bx - 18 * uy} ${by + 18 * ux}L${x} ${y}L${bx + 18 * uy} ${by - 18 * ux}`;
}

// A learner's freehand stroke; a lone point still draws as a dot under its round cap.
export const strokePath = (points: [number, number][]) =>
    `M${points[0]}` + points.map((p) => `L${p}`).join('');

// One board item in board pixels, coloured by its look, entering by hand over its share of the sentence,
// and fading out over the share of the erase that names it (`gone`); the spotlight dims it (`dim`).
// pathLength 1 lets one dash draw any stroke on (src/styles/board-items.css). A point's label sits on `row` 0 or 1
// above its line and slides when a later point reflows it (mockup Rabbithole-brd.5). A flow, tree, table,
// Venn or sketch item draws its `parts` (src/board/layout.ts) one after another, each over its share of the entry.
export default function BoardItem({
    op,
    ms,
    gone,
    row = 0,
    parts = [],
    dim,
}: {
    op: Op;
    ms: number;
    gone?: number;
    row?: number;
    parts?: Part[];
    dim?: boolean;
}) {
    const [x, y] = op.at ?? [0, 0];
    const label = (size: 's' | 'm' | 'l') => (
        <text className={`board-text ${size}`} x={x} y={y}>
            {op.text}
        </text>
    );
    const points = op.points ?? [];
    const path = points.map(([px, py], i) => `${i ? 'L' : 'M'}${px} ${py}`).join('');
    const [fx, fy] = op.from ?? [x, y];
    return (
        <g
            data-item={op.id}
            className={`board-item${op.look ? ` ${op.look}` : ''}${gone ? ' board-gone' : ''}${dim ? ' board-dim' : ''}`}
            style={
                {
                    '--board-ms': `${ms}ms`,
                    ...(gone && { '--gone-ms': `${gone}ms` }),
                } as CSSProperties
            }
        >
            {op.kind === 'highlight' && (
                <rect
                    className="board-wash"
                    x={x - op.w! / 2}
                    y={y - op.h! / 2}
                    width={op.w}
                    height={op.h}
                    rx={28}
                />
            )}
            {op.kind === 'pointer' && (
                <g
                    className="board-pointer"
                    style={{ '--dx': `${fx - x}px`, '--dy': `${fy - y}px` } as CSSProperties}
                >
                    <path
                        transform={`translate(${x} ${y}) scale(1.6)`}
                        d="M0 0V46L13 35L22 55L31 51L22 32H39Z"
                    />
                </g>
            )}
            {op.kind === 'math' && <BoardMath op={op} />}
            {op.kind === 'circle' && (
                <circle className="board-stroke" pathLength={1} cx={x} cy={y} r={op.r} />
            )}
            {op.kind === 'box' && (
                <rect
                    className="board-stroke"
                    pathLength={1}
                    x={x - op.w! / 2}
                    y={y - op.h! / 2}
                    width={op.w}
                    height={op.h}
                    rx={12}
                />
            )}
            {op.kind === 'stroke' && <path className="board-learner" d={strokePath(points)} />}
            {op.kind === 'dot' && <circle className="board-dot" cx={x} cy={y} r={14} />}
            {op.kind === 'line' && <path className="board-stroke" pathLength={1} d={path} />}
            {op.kind === 'arrow' && (
                <path
                    className="board-stroke"
                    pathLength={1}
                    d={path + head(points.at(-2)!, points.at(-1)!)}
                />
            )}
            {(op.kind === 'axes' || op.kind === 'numberline') && (
                <>
                    <path className="board-stroke board-axis" pathLength={1} d={op.d} />
                    <g className="board-ticks">
                        {op.labels?.map((l) => (
                            <text
                                key={`${l.at}`}
                                className={`board-tick${l.end ? ' end' : ''}`}
                                x={l.at[0]}
                                y={l.at[1]}
                            >
                                {l.text}
                            </text>
                        ))}
                    </g>
                </>
            )}
            {op.kind === 'plot' && (
                <path className="board-stroke board-plot" pathLength={1} d={op.d} />
            )}
            {op.kind === 'path' && op.fit && (
                <path
                    className={`board-stroke board-drawn ink-${op.ink}${op.fill ? ` fill-${op.fill}` : ''}`}
                    pathLength={1}
                    transform={`translate(${op.fit[0]} ${op.fit[1]}) scale(${op.fit[2]})`}
                    // 6 board pixels at any scale (mockup Rabbithole-bpl.9).
                    style={{ strokeWidth: 6 / op.fit[2] }}
                    d={op.d}
                />
            )}
            {op.kind === 'point' && (
                <>
                    {row > 0 && (
                        <path
                            className="board-stroke board-leader"
                            pathLength={1}
                            d={`M${x} ${y - 100}V${y - 20}`}
                        />
                    )}
                    <circle className="board-dot board-point" cx={x} cy={y} r={11} />
                    <text
                        className="board-point-label"
                        x={x}
                        y={y - 50}
                        style={{ translate: `0 ${-60 * row}px` }}
                    >
                        {op.text}
                    </text>
                </>
            )}
            {parts.map((part) => (
                <ComponentPart key={part.key} part={part} ms={ms} />
            ))}
            {op.kind === 'text'
                ? label(op.size ?? 'm')
                : !parts.length &&
                  op.kind !== 'point' &&
                  op.kind !== 'math' &&
                  op.text &&
                  label('s')}
        </g>
    );
}

// One part, placed by CSS geometry so a reflow slides it rather than jumping (src/styles/board-items.css).
function ComponentPart({ part, ms }: { part: Part; ms: number }) {
    const [from, to] = part.t;
    const timing = { animationDelay: `${ms * from}ms`, animationDuration: `${ms * (to - from)}ms` };
    if (part.kind === 'box')
        return (
            <rect
                className={`board-stroke board-part-box${part.look ? ` ${part.look}` : ''}`}
                pathLength={1}
                rx={part.rx ?? 18}
                style={{ ...timing, x: part.x, y: part.y, width: part.w, height: part.h }}
            />
        );
    if (part.kind === 'line')
        return (
            <path
                className={`board-stroke board-part-${part.look}`}
                pathLength={1}
                style={{ ...timing, d: `path("${part.d}")` } as CSSProperties}
            />
        );
    if (part.kind === 'circle')
        return (
            <circle
                className={`board-stroke board-part-circle${part.look ? ` ${part.look}` : ''}`}
                pathLength={1}
                style={{ ...timing, cx: part.x, cy: part.y, r: part.r }}
            />
        );
    return (
        <text
            className={`board-part-text${part.look ? ` ${part.look}` : ''}${part.anchor ? ` ${part.anchor}` : ''}`}
            style={{
                ...timing,
                translate: `${part.x}px ${part.y}px`,
                ...(part.size && { fontSize: part.size }),
            }}
        >
            {part.text}
        </text>
    );
}
