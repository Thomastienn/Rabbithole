import { useState } from 'react';
import { BaseEdge, useInternalNode, type EdgeProps, type InternalNode } from '@xyflow/react';
import { inkStyle } from './treeList';
import { linePath, routeLine } from './canvas';

const box = (node: InternalNode) => ({
  ...node.internals.positionAbsolute,
  width: node.measured.width ?? 0,
  height: node.measured.height ?? 0,
});

export default function Branch(props: EdgeProps) {
  // The card boxes come from the store, so dragging either card reroutes the line live.
  const from = useInternalNode(props.source);
  const to = useInternalNode(props.target);
  const path =
    from && to
      ? linePath(
          routeLine(
            { x: props.sourceX, y: props.sourceY },
            { x: props.targetX, y: props.targetY },
            box(from),
            box(to),
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
