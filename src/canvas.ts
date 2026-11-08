export type Point = { x: number; y: number };
export type Box = Point & { width: number; height: number };

export function placeBox(preferred: Point, size: { width: number; height: number }, occupied: Box[]): Point {
  const position = { ...preferred };
  const gap = 48;
  for (;;) {
    const overlap = occupied.find(box => position.x < box.x + box.width + gap && position.x + size.width + gap > box.x && position.y < box.y + box.height + gap && position.y + size.height + gap > box.y);
    if (!overlap) return position;
    position.y = overlap.y + overlap.height + gap;
  }
}
