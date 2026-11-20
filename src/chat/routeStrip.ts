// Contents route strip (mockup line-diagram/read.html). Each row draws its own strip slice, so a
// wrapped title only stretches the vertical lines: the station sits STATION_Y below the row top and
// every turn happens above it. Columns are trunk, family and deeper; depth past two stays in the
// third column so titles keep their width, and the address still names the depth.
export const STATION_Y = 18;
const RISE = 16;
const column = (address: string) => Math.min(address.split('.').length - 1, 2);
const x = (col: number) => 12 + 16 * col;

export type Segment = { x1: number; y1: number; x2: number; y2: number | '100%'; ink: number };

export function routeStrip(
    rows: readonly { id: string; parent: string | null; address: string; ink: number }[],
) {
    const index = new Map(rows.map((r, i) => [r.id, i]));
    const slices = rows.map(() => new Map<string, Segment>());
    // Overlapping runs of one line draw once.
    const add = (row: number, s: Segment) =>
        slices[row].set(`${s.x1} ${s.y1} ${s.x2} ${s.y2} ${s.ink}`, s);
    rows.forEach((r, i) => {
        const parent = r.parent === null ? undefined : index.get(r.parent);
        if (parent === undefined) return;
        // A new family leaves the trunk; inside a family a later sibling continues its elder's line.
        let from = parent;
        if (column(r.address) === 2)
            for (let j = i - 1; j > parent; j--)
                if (rows[j].parent === r.parent) {
                    from = j;
                    break;
                }
        const sx = x(column(rows[from].address)),
            tx = x(column(r.address)),
            ink = rows[from].ink,
            end = sx === tx ? STATION_Y : STATION_Y - RISE;
        add(from, { x1: sx, y1: STATION_Y, x2: sx, y2: '100%', ink });
        for (let j = from + 1; j < i; j++) add(j, { x1: sx, y1: 0, x2: sx, y2: '100%', ink });
        add(i, { x1: sx, y1: 0, x2: sx, y2: end, ink });
        // The 45 degree turn into the station, in the station's family colour.
        if (sx !== tx) add(i, { x1: sx, y1: end, x2: tx, y2: STATION_Y, ink: r.ink });
    });
    return rows.map((r, i) => ({ x: x(column(r.address)), segments: [...slices[i].values()] }));
}
