import { useLayoutEffect, useRef } from 'react';
import type { Anchor } from './branch';

// Keeps a floating passage box in the reading area while it is open: under the selection at `at`, or above the
// selection's first line when there is no room below. Returns the ref for the box.
export function usePassageBoxPlacement(open: boolean, at?: Anchor['at']) {
    const floating = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const box = floating.current;
        if (!box) return;
        const position = () => {
            box.style.transform = '';
            const chat = box.closest('.focused-chat')!;
            const top = chat.querySelector('.chat-header')!.getBoundingClientRect().bottom;
            // The reading area ends at the composer, or at the viewport without one.
            const bottom =
                chat.querySelector('.astryx-chat-composer')?.getBoundingClientRect().top ??
                window.innerHeight;
            const rect = box.getBoundingClientRect();
            const lines = at ? (at.below ?? at.y) - at.y : 0;
            // No room under the selection: sit above its first line instead, when that fits under the header.
            if (at && rect.bottom > bottom && rect.top - lines - rect.height >= top)
                box.style.transform = `translateY(calc(${-lines}px - 100% - 2 * var(--spacing-1)))`;
        };
        position();
        const observer = new ResizeObserver(position);
        observer.observe(box);
        window.addEventListener('resize', position);
        document.addEventListener('scroll', position, true);
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', position);
            document.removeEventListener('scroll', position, true);
        };
    }, [open, at?.y, at?.below]);
    return floating;
}
