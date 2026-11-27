import { useEffect, useMemo } from 'react';
import { drawSketch, type Palette, type SketchItem } from '../sketch/sketch';
import './sketch.css';

// Theme tokens by role (mockup Rabbithole-skt.1). As CSS variables, a theme switch recolours every sketch.
const THEME: Palette = {
    ground: 'var(--color-background-body)',
    ink: 'var(--color-text-primary)',
    muted: 'var(--color-text-secondary)',
    seam: 'var(--color-border-emphasized)',
    focus: 'var(--rabbithole-paper)',
};

// A sketch block in a reply: a placeholder while its fence is open, nothing (logged) when it cannot draw.
export default function Sketch({
    kind,
    body,
    fence,
}: {
    kind: string;
    body: string;
    fence: 'open' | 'closed' | 'unfinished';
}) {
    const sketch = useMemo(
        () => (fence === 'closed' ? drawSketch(kind, body, THEME) : undefined),
        [kind, body, fence],
    );
    const error =
        fence === 'unfinished'
            ? 'unclosed fence'
            : sketch && 'error' in sketch
              ? sketch.error
              : undefined;
    useEffect(() => {
        if (error) console.warn(`Sketch hidden (${kind.trim()}): ${error}`);
    }, [kind, error]);
    if (fence === 'open')
        return <div className="sketch-wait" role="status" aria-label="Drawing a sketch" />;
    if (!sketch || 'error' in sketch) return null;
    return (
        <figure className="sketch" aria-label={sketch.title ? `Sketch: ${sketch.title}` : 'Sketch'}>
            {sketch.title && <figcaption aria-hidden="true">{sketch.title}</figcaption>}
            {/* The module escapes every label the tutor wrote. */}
            <div aria-hidden="true" dangerouslySetInnerHTML={{ __html: sketch.markup }} />
            <Items items={sketch.items} className="sr-only" />
        </figure>
    );
}

// The items in order; a tree's deeper items nest under the item above them.
function Items({ items, className }: { items: SketchItem[]; className?: string }) {
    const level = items[0].level ?? 0;
    return (
        <ul className={className}>
            {items.map((item, i) => {
                if ((item.level ?? 0) !== level) return null;
                const end = items.findIndex((next, j) => j > i && (next.level ?? 0) <= level),
                    kids = items.slice(i + 1, end < 0 ? undefined : end);
                return (
                    <li key={i}>
                        {item.text}
                        {kids.length > 0 && <Items items={kids} />}
                    </li>
                );
            })}
        </ul>
    );
}
