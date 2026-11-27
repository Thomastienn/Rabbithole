import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

// A free-space stroke goes to the tutor as this much of the board around it, in board pixels.
const MARGIN = 40;

// The PNG of a free-space stroke: its area of the 1600×900 board, dark ink on white; null when it lies off the board.
// shortcut: draws only the learner's ink, not board items reaching into the crop; draw those too if tutors misread sketches.
function strokeImage(points) {
    const [xs, ys] = [points.map((p) => p[0]), points.map((p) => p[1])];
    const [x, y] = [Math.max(0, Math.min(...xs) - MARGIN), Math.max(0, Math.min(...ys) - MARGIN)];
    const [w, h] = [
        Math.min(1600, Math.max(...xs) + MARGIN) - x,
        Math.min(900, Math.max(...ys) + MARGIN) - y,
    ];
    if (w <= 0 || h <= 0) return null;
    // A lone point still draws as a dot under the round cap.
    const d = `M${points[0]}` + points.map((p) => `L${p}`).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${x} ${y} ${w} ${h}"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff"/><path d="${d}" fill="none" stroke="#111" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    return sharp(Buffer.from(svg)).png().toBuffer();
}

// The learner's pen on a board (board() is the session's current board): each finished stroke becomes a
// board item of its own, `p<n>`, and waits for the next question, which carries what it marks.
export function boardPen(ctx, board) {
    // The strokes since the last question, as op lines and what each marks.
    let pending = [],
        // The last pen id handed out; never reused in a session, since an erase may be applied but not saved.
        pen = 0;
    return {
        stroke(points) {
            while (board().has(`p${++pen}`));
            const mark = board().mark(points);
            const line = [
                `p${pen} stroke`,
                mark && `${mark.verb.split(' ')[0]}=${mark.ids.join(',')}`,
                ...points.map((p) => p.join(',')),
            ]
                .filter(Boolean)
                .join(' ');
            const { item } = board().read(line);
            pending.push({ line, mark, points });
            return { item, mark };
        },
        // Strokes waiting for the next question stay on a rebuilt board.
        replay: () => pending.forEach((s) => board().read(s.line)),
        // Hands the waiting strokes to a question: their op lines, the note it ends with
        // ("pen: circled t2 · pointed at t3 · strokes p1, p2", or ''), and the free-space strokes.
        take() {
            const marks = Object.entries(
                Object.groupBy(
                    pending.flatMap((s) => s.mark ?? []),
                    (m) => m.verb,
                ),
            ).map(([verb, ms]) => `${verb} ${[...new Set(ms.flatMap((m) => m.ids))].join(', ')}`);
            const strokes = pending.map((s) => s.line.split(' ')[0]);
            const taken = {
                lines: pending.map((s) => s.line),
                note: strokes.length
                    ? `pen: ${[...marks, `strokes ${strokes.join(', ')}`].join(' · ')}`
                    : '',
                free: pending.filter((s) => !s.mark),
            };
            pending = [];
            return taken;
        },
        // Free-space strokes as images, only for a chat model that reads images; the caller removes current.files once the turn ends.
        async sketches(current, tree, model, free) {
            if (!free.length || !(await ctx.readsImages({ provider: tree.provider, model })))
                return [];
            const drawn = [];
            for (const s of free) {
                const png = await strokeImage(s.points);
                if (png) drawn.push({ id: s.line.split(' ')[0], png });
            }
            if (!drawn.length) return [];
            await mkdir(ctx.dir, { recursive: true, mode: 0o700 });
            current.files = await mkdtemp(join(ctx.dir, 'board-'));
            return Promise.all(
                drawn.map(async ({ id, png }) => {
                    const path = join(current.files, `${id}.png`);
                    await writeFile(path, png, { mode: 0o600 });
                    return { id, type: 'image/png', path };
                }),
            );
        },
    };
}
