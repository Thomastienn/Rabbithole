import { useState } from 'react';
import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react';
import { inkStyle } from './treeList';

export default function Branch(props: EdgeProps) {
  const [path] = getBezierPath(props);
  // Negative delay keeps culling/remounts from replaying an already drawn branch.
  const created = props.data?.created as number | undefined;
  const [delay] = useState(() => (created ? Math.min(0, created - performance.now()) : 0));
  return (
    <BaseEdge
      id={props.id}
      path={path}
      pathLength={1}
      className={created ? 'branch-new' : undefined}
      style={{
        ...inkStyle(props.data?.ink as number),
        ...(created && { animationDelay: `${delay}ms` }),
      }}
    />
  );
}
