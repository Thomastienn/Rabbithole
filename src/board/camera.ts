import type { Drawn } from './useBoard';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (2 - 2 * t) ** 3 / 2);

// Keeps the board's view on its latest area (mockup Rabbithole-brd.4): a clear pans down to its fresh area over
// its share (with reduced motion, cross-fades), a drawn item brings a learner who scrolled away back, and a board
// replayed at once shows its last area. Returns a cleanup that stops a pan under way.
export function follow(el: HTMLElement, last: Drawn | undefined) {
    const top = el.scrollHeight - el.clientHeight;
    if (!last?.ms) {
        el.scrollTop = top;
        return;
    }
    if (last.op.kind !== 'clear') {
        if (Math.abs(el.scrollTop - top) > 1)
            el.scrollTo({ top, behavior: reduced() ? 'auto' : 'smooth' });
        return;
    }
    const ms = last.ms;
    if (reduced()) {
        el.firstElementChild?.animate?.([{ opacity: 1 }, { opacity: 0 }, { opacity: 1 }], ms);
        const timer = setTimeout(() => (el.scrollTop = top), ms / 2);
        return () => clearTimeout(timer);
    }
    const [from, start] = [el.scrollTop, performance.now()];
    let frame = 0;
    const tick = (now: number) => {
        const t = Math.min(1, (now - start) / ms);
        el.scrollTop = from + (top - from) * easeInOut(t);
        if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
}
