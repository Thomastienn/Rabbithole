import mermaid from 'mermaid';
import { diagramFontFace } from '../themes/diagramFont';
import { DIAGRAM_HUES, diagramTheme } from './diagramTheme';

// Mermaid has global configuration. Keep each theme initialization with its queued render.
let queue = Promise.resolve();
export function renderDiagram(source: string, card: HTMLElement, dark: boolean): Promise<string> {
  const style = getComputedStyle(card);
  const probe = card.appendChild(document.createElement('span'));
  const series = DIAGRAM_HUES.map((hue) => {
    probe.style.color = `var(--color-text-${hue})`;
    return getComputedStyle(probe).color;
  });
  probe.remove();
  // Trusted app classes the worker may assign (A:::blue). Each also differs by border so colour is never the only cue.
  const hex = (color: string) => {
    const c = document.createElement('canvas').getContext('2d')!;
    c.fillStyle = color;
    c.fillRect(0, 0, 1, 1);
    return (
      '#' +
      [...c.getImageData(0, 0, 1, 1).data.slice(0, 3)]
        .map((n) => n.toString(16).padStart(2, '0'))
        .join('')
    );
  };
  const borders = [
    'stroke-width:2px',
    'stroke-width:2px,stroke-dasharray:6 3',
    'stroke-width:2px,stroke-dasharray:2 2',
    'stroke-width:3.5px',
  ];
  const classes = DIAGRAM_HUES.map(
    (hue, i) =>
      `classDef ${hue} fill:${hex(series[i])},color:${hex(style.backgroundColor)},stroke:${hex(style.color)},${borders[i]}`,
  ).join('\n');
  const styled = /^\s*(?:flowchart|graph)\b/.test(source.replace(/^\s*%%[^\n]*/gm, ''))
    ? `${source}\n${classes}`
    : source;
  const render = queue.then(async () => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      htmlLabels: false,
      flowchart: { htmlLabels: false },
      suppressErrorRendering: true,
      maxTextSize: 17 * 1024,
      theme: 'base',
      look: 'classic',
      themeVariables: diagramTheme(style, series, dark),
      // Line Diagram: 8px container corners and round-capped, line-weight strokes.
      themeCSS:
        '.node rect{rx:8px;ry:8px;stroke-width:1.5px}.flowchart-link{stroke-width:2px;stroke-linecap:round;stroke-linejoin:round}',
    });
    const { svg } = await mermaid.render(`diagram-${crypto.randomUUID()}`, styled);
    const drawing = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
    if (
      drawing.localName !== 'svg' ||
      drawing.querySelector('parsererror, foreignObject, a, script, image')
    )
      throw new Error('Unsupported diagram output.');
    const [, , width, height] = (drawing.getAttribute('viewBox') ?? '').split(/\s+/).map(Number);
    if (!(width > 0 && height > 0)) throw new Error('Diagram has no drawing area.');
    drawing.setAttribute('width', String(Math.ceil(width)));
    drawing.setAttribute('height', String(Math.ceil(height)));
    drawing.removeAttribute('style');
    const face = drawing.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'style');
    face.textContent = diagramFontFace;
    drawing.prepend(face);
    // SVG images cannot execute scripts or follow links. No HTML insertion or bindFunctions.
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(drawing))}`;
  });
  queue = render.then(
    () => {},
    () => {},
  );
  return render;
}
