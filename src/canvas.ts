export type Point = { x: number; y: number };
export type Box = Point & { width: number; height: number };
export type Viewport = Point & { zoom: number };

export function parseViewport(value: string | null): Viewport | undefined {
  try {
    const view = JSON.parse(value ?? 'null');
    if (view && Number.isFinite(view.x) && Number.isFinite(view.y) && Number.isFinite(view.zoom) && view.zoom >= 0.2 && view.zoom <= 1.5) return { x: view.x, y: view.y, zoom: view.zoom };
  } catch { /* An invalid saved view falls back to fitting the tree. */ }
}

export function placeBox(preferred: Point, size: { width: number; height: number }, occupied: Box[]): Point {
  const position = { ...preferred };
  const gap = 48;
  for (;;) {
    const overlap = occupied.find(box => position.x < box.x + box.width + gap && position.x + size.width + gap > box.x && position.y < box.y + box.height + gap && position.y + size.height + gap > box.y);
    if (!overlap) return position;
    position.y = overlap.y + overlap.height + gap;
  }
}
