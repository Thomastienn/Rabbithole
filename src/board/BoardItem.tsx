import type { CSSProperties } from 'react';
import type { Op } from './player';

// An arrowhead is two strokes 24 board pixels back along the shaft and 18 either side (mockup Rabbithole-brd.2).
function head([x0, y0]: [number, number], [x, y]: [number, number]) {
    const length = Math.hypot(x - x0, y - y0) || 1;
    const [ux, uy] = [(x - x0) / length, (y - y0) / length];
    const [bx, by] = [x - 24 * ux, y - 24 * uy];
    return `M${bx - 18 * uy} ${by + 18 * ux}L${x} ${y}L${bx + 18 * uy} ${by - 18 * ux}`;
}

// One board item in board pixels, coloured by its look, entering by hand over its share of the sentence.
// pathLength 1 lets one dash draw any stroke on (src/styles/board.css). A point's label sits on `row` 0 or 1
// above its line and slides when a later point reflows it (mockup Rabbithole-brd.5).
export default function BoardItem({ op, ms, row = 0 }: { op: Op; ms: number; row?: number }) {
    const [x, y] = op.at ?? [0, 0];
    const label = (size: 's' | 'm' | 'l') => (
        <text className={`board-text ${size}`} x={x} y={y}>
            {op.text}
        </text>
    );
    const points = op.points ?? [];
    const path = points.map(([px, py], i) => `${i ? 'L' : 'M'}${px} ${py}`).join('');
    return (
        <g
            className={`board-item${op.look ? ` ${op.look}` : ''}`}
            style={{ '--board-ms': `${ms}ms` } as CSSProperties}
        >
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
            {op.kind === 'text'
                ? label(op.size ?? 'm')
                : op.kind !== 'point' && op.text && label('s')}
        </g>
    );
}
