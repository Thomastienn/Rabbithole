import { createContext, useContext, useEffect, useState } from 'react';
import {
    BaseEdge,
    useInternalNode,
    useStore,
    type EdgeProps,
    type InternalNode,
} from '@xyflow/react';
import { inkStyle } from './treeList';
import { branchLanes, linePath, routeLine } from './canvas';

const box = (node: InternalNode) => ({
    ...node.internals.positionAbsolute,
    width: node.measured.width ?? 0,
    height: node.measured.height ?? 0,
});

export const Lanes = createContext<Record<string, number>>({});

const ring = (node: InternalNode, handle: { x: number; y: number; height: number }) => ({
    x: node.internals.positionAbsolute.x + handle.x,
    y: node.internals.positionAbsolute.y + handle.y + handle.height / 2,
});

// Lanes need every sibling's route, so they are worked out once per map update and handed to the lines.
export function MeasureLanes({ onChange }: { onChange: (lanes: Record<string, number>) => void }) {
    const lanes = useStore((s) =>
        JSON.stringify(
            branchLanes(
                s.edges.flatMap((edge) => {
                    const from = s.nodeLookup.get(edge.source),
                        to = s.nodeLookup.get(edge.target);
                    const out = from?.internals.handleBounds?.source?.find(
                        (h) => h.id === edge.sourceHandle,
                    );
                    const into = to?.internals.handleBounds?.target?.[0];
                    if (edge.type !== 'branch' || !out || !into) return [];
                    const points = routeLine(
                        ring(from!, out),
                        ring(to!, into),
                        box(from!),
                        box(to!),
                    );
                    return [{ id: edge.id, parent: edge.source, points }];
                }),
            ),
        ),
    );
    useEffect(() => onChange(JSON.parse(lanes)), [lanes, onChange]);
    return null;
}

export default function Branch(props: EdgeProps) {
    // The card boxes come from the store, so dragging either card reroutes the line live.
    const from = useInternalNode(props.source);
    const to = useInternalNode(props.target);
    const lane = useContext(Lanes)[props.id] ?? 0;
    const path =
        from && to
            ? linePath(
                  routeLine(
                      { x: props.sourceX, y: props.sourceY },
                      { x: props.targetX, y: props.targetY },
                      box(from),
                      box(to),
                      lane,
                  ),
              )
            : '';
    // Negative delay keeps culling/remounts from replaying an already drawn branch.
    const created = props.data?.created as number | undefined;
    const [delay] = useState(() => (created ? Math.min(0, created - performance.now()) : 0));
    return (
        <BaseEdge
            id={props.id}
            path={path}
            pathLength={created ? 1 : undefined}
            className={created ? 'branch-new' : undefined}
            style={{
                ...inkStyle(props.data?.ink as number),
                ...(created && { animationDelay: `${delay}ms` }),
            }}
        />
    );
}
