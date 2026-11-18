import { useEffect, useMemo, useRef, useState } from 'react';
import { Position, type Edge } from '@xyflow/react';
import { placeBox, type Point } from './canvas';
import { ghostTrees, miniature, MINIATURE, type GhostTree } from './ghostTrees';
import type { ConversationNode } from './Conversation';
import type { GhostNode } from './GhostTree';
import type { Summary } from './TreeOverview';

// Room for the miniature, its title and the button's padding.
const GHOST = { width: MINIATURE + 16, height: MINIATURE + 48 };

// The map's ghost tree nodes and dashed lines, each placed in free space near its first linked node.
export function useGhostTrees({
  trees,
  root,
  from,
  nodes,
  open,
}: {
  trees: Summary[];
  root: string;
  from?: string;
  nodes: ConversationNode[];
  open: (ghost: GhostTree) => void;
}) {
  const callback = useRef(open);
  callback.current = open;
  const ghosts = useMemo(() => ghostTrees(trees, root, from), [trees, root, from]);
  const [positions, setPositions] = useState<Record<string, Point>>({});
  useEffect(() => {
    const placed = { ...positions };
    for (const ghost of ghosts) {
      if (placed[ghost.root]) continue;
      const linked = nodes.find((n) => n.id === ghost.links[0]);
      const c = linked?.data.conversation;
      // Wait until the map has placed (and measured) the linked conversation node.
      if (!linked?.measured?.width || !c || (c.x === null && c.parent)) continue;
      const occupied = [
        ...nodes
          .filter((n) => !n.hidden && n.measured?.width && n.measured.height)
          .map((n) => ({ ...n.position, width: n.measured!.width!, height: n.measured!.height! })),
        ...Object.values(placed).map((p) => ({ ...p, ...GHOST })),
      ];
      placed[ghost.root] = placeBox(
        { x: linked.position.x + linked.measured.width + 72, y: linked.position.y },
        GHOST,
        occupied,
      );
    }
    if (Object.keys(placed).length > Object.keys(positions).length) setPositions(placed);
  }, [ghosts, nodes]);
  const ghostNodes = useMemo(
    () =>
      ghosts
        .filter((g) => positions[g.root])
        .map((ghost): GhostNode => ({
          id: `ghost-${ghost.root}`,
          type: 'ghost',
          position: positions[ghost.root],
          focusable: false,
          draggable: false,
          selectable: false,
          // Fixed size and handle: these nodes bypass the map's node state, so nothing stores a measurement.
          ...GHOST,
          measured: GHOST,
          handles: [{ type: 'target', position: Position.Left, x: 0, y: GHOST.height / 2 }],
          data: { ghost, shape: miniature(trees, ghost.root), open: (g) => callback.current(g) },
        })),
    [ghosts, positions, trees],
  );
  const ghostEdges = useMemo(
    () =>
      ghostNodes.flatMap(({ id, data: { ghost } }): Edge[] =>
        ghost.links.map((link) => ({
          id: `${id}-${link}`,
          source: link,
          sourceHandle: 'ghost',
          target: id,
          className: 'ghost-link',
          focusable: false,
        })),
      ),
    [ghostNodes],
  );
  return { ghostNodes, ghostEdges };
}
