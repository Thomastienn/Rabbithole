import { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { MINIATURE, type GhostTree as Ghost, type miniature } from './ghostTrees';
import { inkStyle } from './treeList';

export type GhostNode = Node<
    { ghost: Ghost; shape: ReturnType<typeof miniature>; open: (ghost: Ghost) => void },
    'ghost'
>;

// Another learning tree that explored a shared concept: a faded miniature and its title.
export const GhostTree = memo(function GhostTree({ data }: NodeProps<GhostNode>) {
    const { ghost, shape } = data;
    return (
        <>
            <Handle type="target" position={Position.Left} />
            <button
                type="button"
                className="ghost-tree nopan"
                aria-label={`Open ${ghost.title}, which also explored ${ghost.concepts.join(', ')}`}
                onClick={() => data.open(ghost)}
            >
                <svg width={MINIATURE} height={MINIATURE} aria-hidden="true">
                    {shape.lines.map((l) => (
                        <line
                            key={l.id}
                            x1={l.x1}
                            y1={l.y1}
                            x2={l.x2}
                            y2={l.y2}
                            style={inkStyle(l.ink)}
                        />
                    ))}
                    {shape.dots.map((d) => (
                        <circle
                            key={d.id}
                            data-dot={d.id}
                            cx={d.x}
                            cy={d.y}
                            r={4}
                            style={inkStyle(d.ink)}
                        />
                    ))}
                </svg>
                <span className="ghost-tree__title">{ghost.title}</span>
            </button>
        </>
    );
});
