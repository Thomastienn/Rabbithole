import type { Op } from './player';
import type { Drawn } from './useBoard';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (2 - 2 * t) ** 3 / 2);

// The page open after these ops: its top edge in board pixels, each page 900 below the one before (ADR 0029).
export const openTop = (ops: Op[]) => ops.findLast((op) => op.top !== undefined)?.top ?? 0;

// Keeps the board's view on the open page, one page tall: a page, open or clear slides to its page over its share
// (with reduced motion, cross-fades), a drawn item brings a learner who looked away back, and a board replayed at
// once shows its open page. Returns a cleanup that stops a slide under way.
export function follow(el: HTMLElement, last: Drawn | undefined, top: number) {
    const to = (top / 900) * el.clientHeight;
    if (!last?.ms) {
        el.scrollTop = to;
        return;
    }
    if (last.op.top === undefined) {
        if (Math.abs(el.scrollTop - to) > 1)
            el.scrollTo({ top: to, behavior: reduced() ? 'auto' : 'smooth' });
        return;
    }
    const ms = last.ms;
    if (reduced()) {
        el.firstElementChild?.animate?.([{ opacity: 1 }, { opacity: 0 }, { opacity: 1 }], ms);
        const timer = setTimeout(() => (el.scrollTop = to), ms / 2);
        return () => clearTimeout(timer);
    }
    const [from, start] = [el.scrollTop, performance.now()];
    let frame = 0;
    const tick = (now: number) => {
        const t = Math.min(1, (now - start) / ms);
        el.scrollTop = from + (to - from) * easeInOut(t);
        if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
}
