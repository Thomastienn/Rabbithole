import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

// A free-space stroke goes to the tutor as this much of the board around it, in board pixels.
const MARGIN = 40;

// The PNG of a free-space stroke: its area of its 1600×900 board page, dark ink on white; null when it lies off the board.
// shortcut: draws only the learner's ink, not board items reaching into the crop; draw those too if tutors misread sketches.
export function strokeImage(points) {
    const [xs, ys] = [points.map((p) => p[0]), points.map((p) => p[1])];
    // Each board page is 900 pixels below the one before it (server/board/ops.mjs).
    const top = Math.floor(Math.min(...ys) / 900) * 900;
    const [x, y] = [Math.max(0, Math.min(...xs) - MARGIN), Math.max(top, Math.min(...ys) - MARGIN)];
    const [w, h] = [
        Math.min(1600, Math.max(...xs) + MARGIN) - x,
        Math.min(top + 900, Math.max(...ys) + MARGIN) - y,
    ];
    if (w <= 0 || h <= 0) return null;
    // A lone point still draws as a dot under the round cap.
    const d = `M${points[0]}` + points.map((p) => `L${p}`).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${x} ${y} ${w} ${h}"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff"/><path d="${d}" fill="none" stroke="#111" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    return sharp(Buffer.from(svg)).png().toBuffer();
}

// The learner's pen and view on a board (board() is the session's current board): each finished stroke becomes a
// board item of its own, `p<n>`, and each page they open an `open` op, waiting for the next question, which carries
// what they mark and the page it was asked from.
// send() takes the open item down to the learner's board when their view opens a page; a view alone tells the
// model nothing until the next question.
export function boardPen(ctx, board, send) {
    // The strokes and opens since the last question, as op lines and what each marks.
    let pending = [],
        // The last pen id handed out; never reused in a session, since an erase may be applied but not saved.
        pen = 0,
        // The page the learner opened mid-reply ('' for the tutor's page), opened on the board once the reply ends.
        viewing;
    const next = () => {
        while (board().has(`p${++pen}`));
        return `p${pen}`;
    };
    return {
        stroke(points) {
            const id = next();
            // Mid-reply the learner may be looking at another page than the one the tutor draws on.
            const mark = board().mark(points, viewing || undefined);
            const line = [
                `${id} stroke`,
                mark && `${mark.verb.split(' ')[0]}=${mark.ids.join(',')}`,
                ...points.map((p) => p.join(',')),
            ]
                .filter(Boolean)
                .join(' ');
            const { item } = board().read(line);
            pending.push({ line, mark, points });
            return { item, mark };
        },
        // The learner opened `page` (none: back to the tutor's page, the open page before their first view since the
        // last question). An `open` op waits with the strokes, so the strokes and the next reply land on that page
        // and replay there; a view straight back drops it. Mid-reply (busy) the view waits for settle(), since the
        // tutor's ops land on its own page. A page that is no item id is ignored.
        view(page, busy) {
            if (page !== undefined && !/^[A-Za-z_][\w-]*$/.test(page)) return;
            viewing = busy ? (page ?? '') : undefined;
            if (busy) return;
            const home = pending.find((s) => s.page)?.home ?? board().open();
            const to = page || home;
            if (!to || to === board().open()) return;
            const line = `${next()} open ${to}`;
            const { item } = board().read(line);
            if (!item) return;
            while (pending.at(-1)?.page) pending.pop();
            if (to !== (pending.findLast((s) => s.page)?.page ?? home))
                pending.push({ line, page: to, home });
            send({ type: 'stroke', item });
        },
        // The reply ended: a view the learner chose during it opens now.
        settle() {
            if (viewing !== undefined) this.view(viewing);
        },
        // Strokes waiting for the next question stay on a rebuilt board.
        replay: () => pending.forEach((s) => board().read(s.line)),
        // Hands the waiting strokes and opens to a question: their op lines, the note it ends with
        // ("pen: circled t2 · pointed at t3 · strokes p1, p2", then "page: s1" when asked from a page other than
        // the tutor's, or ''), and the free-space strokes.
        take() {
            const opened = pending.findLast((s) => s.page);
            const page = opened && opened.page !== opened.home && `page: ${opened.page}`;
            const marks = Object.entries(
                Object.groupBy(
                    pending.flatMap((s) => s.mark ?? []),
                    (m) => m.verb,
                ),
            ).map(([verb, ms]) => `${verb} ${[...new Set(ms.flatMap((m) => m.ids))].join(', ')}`);
            const strokes = pending.filter((s) => s.points).map((s) => s.line.split(' ')[0]);
            const drawn =
                strokes.length && `pen: ${[...marks, `strokes ${strokes.join(', ')}`].join(' · ')}`;
            const taken = {
                lines: pending.map((s) => s.line),
                note: [drawn, page].filter(Boolean).join('\n'),
                free: pending.filter((s) => s.points && !s.mark),
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
