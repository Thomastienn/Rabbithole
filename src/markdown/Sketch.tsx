import { useEffect, useMemo } from 'react';
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
            <ul className="sr-only">
                {sketch.items.map((item, i) => (
                    <li key={i}>{item.text}</li>
                ))}
            </ul>
        </figure>
    );
}
