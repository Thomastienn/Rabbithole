import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { drawSketch, type Palette, type Sketch as Drawing } from '../sketch/sketch';
import './sketch.css';

// Theme tokens by role (mockup Rabbithole-skt.1). As CSS variables, a theme switch recolours every sketch.
// Layouts on a raised surface set --sketch-ground, so station rings take the surface under them.
const THEME: Palette = {
    ground: 'var(--sketch-ground, var(--color-background-body))',
    ink: 'var(--color-text-primary)',
    muted: 'var(--color-text-secondary)',
    seam: 'var(--color-border-emphasized)',
    focus: 'var(--rabbithole-paper)',
};

// A sketch block in a reply: a placeholder while its fence is open, nothing (logged) when it cannot draw.
// One that arrives in a streaming reply builds in item by item, like the text around it; a saved reply's shows at once.
// It draws at its own box's width (mockup Rabbithole-skt.5), so it fits whichever layout cell holds it.
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
    const [width, setWidth] = useState(640);
    const sketch = useMemo(
        () => (fence === 'closed' ? drawSketch(kind, body, THEME, width) : undefined),
        [kind, body, fence, width],
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
    return <SketchDrawing sketch={sketch} live={live} onWidth={setWidth} />;
}

function SketchDrawing({
    sketch,
    live,
    onWidth,
}: {
    sketch: Drawing;
    live: boolean;
    onWidth: (width: number) => void;
}) {
    const box = useRef<HTMLElement>(null);
    const [build, setBuild] = useState(
        () => live && !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    );
    // A later redraw at a new width, or a hidden check answer opening, shows the sketch whole.
    useEffect(() => {
        if (!build) return;
        const done = setTimeout(() => setBuild(false), 500);
        return () => clearTimeout(done);
    }, [build]);
    // Measured before paint, so the first frame is already drawn at the box's width; a hidden box (0) keeps the last.
    useLayoutEffect(() => {
        const el = box.current!,
            measure = () => el.clientWidth && onWidth(el.clientWidth);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(el);
        return () => observer.disconnect();
    }, [onWidth]);
    return (
        <figure
            ref={box}
            className={build ? 'sketch sketch-build' : 'sketch'}
            // The items share about 0.5 s: 0.3 s of staggered starts, then each fades for 0.2 s.
            style={
                build
                    ? ({
                          '--step': `${300 / Math.max(sketch.items.length - 1, 1)}ms`,
                          '--fade': '200ms',
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
