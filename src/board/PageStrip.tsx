import { useLayoutEffect, useRef, useState } from 'react';
import { ArrowTurnDownRightIcon, ArrowUturnLeftIcon } from '@heroicons/react/24/outline';
import type { Op } from './player';

export type Page = { id: string; title: string; top: number; parent?: string };

// A board's pages (ADR 0029) in strip order: creation order with each side page right after its parent, depth
// first, and the page open after these ops. A board that drew before any page op starts on the untitled page
// `first` (server/board/ops.mjs).
export function pagesOf(ops: Op[]) {
    const made: Page[] = ops
        .filter((op) => op.kind === 'page' || op.kind === 'clear')
        .map((op) => ({ id: op.id, title: op.title!, top: op.top!, parent: op.parent }));
    if (ops.length && !made.some((p) => p.top === 0))
        made.unshift({ id: 'first', title: 'Page 1', top: 0 });
    const under = (parent?: string): Page[] =>
        made.filter((p) => p.parent === parent).flatMap((p) => [p, ...under(p.id)]);
    const last = ops.findLast((op) => op.top !== undefined);
    return { pages: under(), open: last ? (last.page ?? last.id) : made[0]?.id };
}

// The thin strip above the board (mockup Rabbithole-pgs.4): every page title, the page on screen marked; clicking a
// title opens it. Overflowing, it scrolls sideways with the marked title centred and fades an edge with more beyond.
export default function PageStrip({
    pages,
    current,
    open,
}: {
    pages: Page[];
    current?: string;
    open: (page: string) => void;
}) {
    const strip = useRef<HTMLElement>(null);
    const [more, setMore] = useState('');
    const fade = (s: HTMLElement) =>
        setMore(
            `${s.scrollLeft > 0 ? ' more-l' : ''}${s.scrollLeft + s.clientWidth < s.scrollWidth - 1 ? ' more-r' : ''}`,
        );
    useLayoutEffect(() => {
        const s = strip.current;
        const marked = s?.querySelector<HTMLElement>('[aria-current]');
        if (!s) return;
        if (marked) s.scrollLeft = marked.offsetLeft + marked.offsetWidth / 2 - s.clientWidth / 2;
        fade(s);
    }, [current, pages.length]);
    return (
        <nav
            ref={strip}
            className={`page-strip${more}`}
            aria-label="Board pages"
            onScroll={(e) => fade(e.currentTarget)}
        >
            {pages.map((p) => (
                <button
                    key={p.id}
                    type="button"
                    className="page-tab"
                    aria-current={p.id === current ? 'page' : undefined}
                    onClick={() => open(p.id)}
                >
                    {p.parent && <ArrowTurnDownRightIcon aria-label="from" />}
                    <span>{p.title}</span>
                </button>
            ))}
        </nav>
    );
}

// On a side page, top left over the board: opens the page it was made from.
export function BackChip({ parent, open }: { parent: Page; open: (page: string) => void }) {
    const label = `Back to ${parent.title}`;
    return (
        <button
            type="button"
            className="board-back"
            aria-label={label}
            onClick={() => open(parent.id)}
        >
            <ArrowUturnLeftIcon aria-hidden />
            <span>{label}</span>
        </button>
    );
}
