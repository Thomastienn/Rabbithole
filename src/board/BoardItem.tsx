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
// pathLength 1 lets one dash draw any stroke on (src/styles/board.css).
export default function BoardItem({ op, ms }: { op: Op; ms: number }) {
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
            {op.kind === 'text' ? label(op.size ?? 'm') : op.text && label('s')}
        </g>
    );
}
