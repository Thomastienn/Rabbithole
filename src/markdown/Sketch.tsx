import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { drawSketch, type Palette } from '../sketch/sketch';
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
// One that arrives in a streaming reply builds in item by item, like the text around it; a saved reply's shows at once.
export default function Sketch({
    kind,
    body,
    fence,
    live,
}: {
    kind: string;
    body: string;
    fence: 'open' | 'closed' | 'unfinished';
    live: boolean;
}) {
    const [build] = useState(
        () => live && !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    );
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
        <figure
            className={build ? 'sketch sketch-build' : 'sketch'}
            // The items share about 0.5 s: 0.3 s of staggered starts, then each fades for 0.2 s.
            style={
                build
                    ? ({
                          '--step': `${300 / Math.max(sketch.items.length - 1, 1)}ms`,
                      } as CSSProperties)
                    : undefined
            }
            aria-label={sketch.title ? `Sketch: ${sketch.title}` : 'Sketch'}
        >
            {sketch.title && <figcaption aria-hidden="true">{sketch.title}</figcaption>}
            {/* The module escapes every label the tutor wrote. */}
            <div aria-hidden="true" dangerouslySetInnerHTML={{ __html: sketch.markup }} />
            <ul className="sr-only">
                {sketch.items.map((item, i) => (
                    <li key={i}>{item.text}</li>
                ))}
            </ul>
        </figure>
    );
}
