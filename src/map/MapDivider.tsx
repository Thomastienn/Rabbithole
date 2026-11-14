import type { RefObject } from 'react';
import {
  MIN_MAP_WIDTH,
  clampMapWidth,
  keyMapWidth,
  maxMapWidth,
  remPx,
  resetMapWidth,
} from './mapWidth';

// The seam between the reading column and the docked map: drag, double-click or arrow keys resize the map.
export default function MapDivider({
  width,
  workspaceWidth,
  workspace,
  setWidth,
}: {
  width: number;
  workspaceWidth: number;
  workspace: RefObject<HTMLElement | null>;
  setWidth: (width: number) => void;
}) {
  return (
    <div
      className="chat-divider"
      role="separator"
      tabIndex={0}
      aria-label="Resize map"
      aria-controls="learning-tree-map"
      aria-orientation="vertical"
      aria-valuemin={MIN_MAP_WIDTH}
      aria-valuemax={Math.round(maxMapWidth(workspaceWidth))}
      aria-valuenow={Math.round(width)}
      aria-valuetext={`Map width ${Math.round(width)} rem`}
      title="Drag to resize the map. Double-click to reset."
      onPointerDown={(e) => {
        if (e.button) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
        const box = workspace.current!.getBoundingClientRect();
        setWidth(clampMapWidth((box.right - e.clientX) / remPx(), box.width / remPx()));
      }}
      onDoubleClick={() => setWidth(resetMapWidth(workspaceWidth))}
      onKeyDown={(e) => {
        const next = keyMapWidth(width, e.key, workspaceWidth, e.shiftKey);
        if (next === undefined) return;
        e.preventDefault();
        setWidth(next);
      }}
    />
  );
}
