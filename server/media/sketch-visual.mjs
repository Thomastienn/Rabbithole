import { isSketch, parse, plainText } from '../../src/markdown/markdownText.ts';
import { drawSketch } from '../../src/sketch/sketch.ts';
import { LIMITS } from './reply-parser.mjs';

const PALETTE = { ground: '', ink: '', muted: '', seam: '', focus: '' };
const NEAR = LIMITS.excerpt / 2;

// The visual request for expanding the sketch whose block starts at `at` in a saved reply (ADR 0027):
// its title and items, and the text it sits beside. Null when no drawable sketch starts there.
export function sketchRequest(text, at) {
    let found;
    const walk = (n) => {
        if (isSketch(n) && n.position?.start.offset === at) found = n;
        else n.children?.forEach(walk);
    };
    walk(parse(text));
    const sketch = found?.sketchClosed && drawSketch(found.meta ?? '', found.value ?? '', PALETTE);
    if (!sketch || 'error' in sketch) return null;
    const kind = found.meta.trim().toLowerCase(),
        items = sketch.items.map((item) => item.text).join('; '),
        title = sketch.title || `${kind[0].toUpperCase()}${kind.slice(1)} sketch`,
        cut = (s, limit) => s.trim().slice(0, limit).trim();
    return {
        title: cut(title, LIMITS.title),
        description: cut(`${title}: ${items}`, LIMITS.description),
        intent: cut(
            `Expand the ${kind} sketch "${title}" into a full visual that takes its place in the reply. Its items: ${items}`,
            LIMITS.intent,
        ),
        excerpt: cut(
            `${plainText(text.slice(0, at)).slice(-NEAR)}\n\n${plainText(text.slice(found.position.end.offset)).slice(0, NEAR)}`,
            LIMITS.excerpt,
        ),
        shows: cut(items, 280),
    };
}
