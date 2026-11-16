import { useEffect, useRef, useState } from 'react';
import type { ReactFlowInstance } from '@xyflow/react';
import { parseViewport } from './canvas';
import { revealViewport } from './mapState';
import type { ConversationNode } from './Conversation';
import type { Summary } from './TreeOverview';

export const fit = { padding: 0.2, maxZoom: 1 };

export function useMapViewport({
  root,
  trees,
  nodes,
  selected,
}: {
  root: string;
  trees: Summary[];
  nodes: ConversationNode[];
  selected?: string;
}) {
  const flow = useRef<ReactFlowInstance<ConversationNode>>(null);
  // Legacy views lived in localStorage; read once until the first batched save replaces them.
  const [savedViewport] = useState(() => {
    try {
      return (
        trees.find((t) => t.id === root)?.layout?.viewport ??
        parseViewport(localStorage.getItem(`rabbithole.viewport.${root}`))
      );
    } catch {
      return undefined;
    }
  });
  const navigated = useRef(!!savedViewport);
  const [zoom, setZoom] = useState(savedViewport?.zoom ?? 1);
  // A restored viewport wins for the restored selection; later selections are still revealed.
  const restored = trees.find((t) => t.id === root)?.layout;
  const [refitted, setRefitted] = useState(0);
  const restoredSelection = useRef(
    savedViewport && restored?.panel !== 'collapsed'
      ? (restored?.selected ?? undefined)
      : undefined,
  );
  useEffect(() => {
    if (!selected) return;
    if (restoredSelection.current === selected) return;
    restoredSelection.current = undefined;
    const frame = requestAnimationFrame(() => {
      const canvas = document.querySelector<HTMLElement>('.tree-canvas');
      const instance = flow.current,
        node = instance?.getNode(selected);
      if (!canvas || !node?.measured?.width || !node.measured.height || !instance) return;
      const bounds = canvas.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const view = instance.getViewport();
      const toolbar = document.querySelector('.map-toolbar')?.getBoundingClientRect();
      const next = revealViewport(
        view,
        { ...node.position, width: node.measured.width, height: node.measured.height },
        bounds.width,
        bounds.height,
        toolbar && { top: toolbar.top - bounds.top, height: toolbar.height },
      );
      const zoom = next.zoom;
      const duration =
        window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
        (nodes.length > 50 && zoom > view.zoom * 2)
          ? 0
          : 200;
      if (next.x !== view.x || next.y !== view.y || zoom !== view.zoom)
        void instance.setViewport(next, { duration });
    });
    return () => cancelAnimationFrame(frame);
  }, [
    selected,
    refitted,
    nodes.length,
    nodes.find((node) => node.id === selected)?.measured?.width,
    nodes.find((node) => node.id === selected)?.measured?.height,
  ]);
  // Switching Map and Read resizes the canvas; refit an untouched map (readable floor, selected node revealed after); a navigated view stays exactly as left.
  const [canvasWidth, setCanvasWidth] = useState(0);
  useEffect(() => {
    const canvas = document.querySelector('.tree-canvas');
    if (!canvas) return;
    const observer = new ResizeObserver(([entry]) =>
      setCanvasWidth(Math.round(entry.contentRect.width)),
    );
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);
  const lastWidth = useRef(0);
  useEffect(() => {
    const previous = lastWidth.current,
      instance = flow.current;
    lastWidth.current = canvasWidth;
    if (!previous || !canvasWidth || previous === canvasWidth || !instance) return;
    if (!navigated.current)
      void instance.fitView({ ...fit, minZoom: 0.75 }).then(() => setRefitted((n) => n + 1));
  }, [canvasWidth]);
  function pan(x: number, y: number) {
    const instance = flow.current;
    if (!instance) return;
    navigated.current = true;
    const view = instance.getViewport();
    void instance.setViewport({ ...view, x: view.x + x, y: view.y + y });
  }
  const zoomOut = () => {
    navigated.current = true;
    void flow.current?.zoomOut();
  };
  const zoomIn = () => {
    navigated.current = true;
    void flow.current?.zoomIn();
  };
  const fitTree = () => {
    navigated.current = true;
    void flow.current?.fitView(fit);
  };
  return { flow, savedViewport, navigated, zoom, setZoom, pan, zoomOut, zoomIn, fitTree };
}
