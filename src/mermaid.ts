import mermaid from 'mermaid';
import { diagramFontFace } from './themes/slate/diagramFont';

// Mermaid has global configuration. Keep each theme initialization with its queued render.
let queue = Promise.resolve();
// Series order from the spec: yellow, blue, pink, green chalk, resolved for the current appearance.
const hues = ['yellow', 'blue', 'pink', 'green'];
export function renderDiagram(source: string, card: HTMLElement, dark: boolean): Promise<string> {
  const style = getComputedStyle(card);
  const probe = card.appendChild(document.createElement('span'));
  const series = hues.map(hue => { probe.style.color = `var(--color-text-${hue})`; return getComputedStyle(probe).color; });
  probe.remove();
  // Series fills carry surface-coloured labels; chalk hues are light in dark and dark in light.
  const seriesVariables = Object.fromEntries(series.flatMap((color, i) => [
    [`cScale${i}`, color], [`cScaleLabel${i}`, style.backgroundColor], [`pie${i + 1}`, color],
    [`git${i}`, color], [`gitBranchLabel${i}`, style.backgroundColor],
  ]));
  const render = queue.then(async () => {
    mermaid.initialize({
      startOnLoad: false, securityLevel: 'strict', htmlLabels: false,
      flowchart: { htmlLabels: false }, suppressErrorRendering: true,
      maxTextSize: 16 * 1024, theme: 'base', look: 'classic',
      themeVariables: {
        darkMode: dark,
        background: style.backgroundColor, fontSize: style.fontSize,
        primaryColor: style.backgroundColor, secondaryColor: style.backgroundColor, tertiaryColor: style.backgroundColor,
        primaryTextColor: style.color, secondaryTextColor: style.color, tertiaryTextColor: style.color, textColor: style.color, lineColor: style.color,
        primaryBorderColor: style.borderColor, secondaryBorderColor: style.borderColor, tertiaryBorderColor: style.borderColor, fontFamily: style.fontFamily,
        edgeLabelBackground: style.backgroundColor, labelBackground: style.backgroundColor,
        pieSectionTextColor: style.backgroundColor, pieStrokeColor: style.backgroundColor, pieOuterStrokeColor: style.borderColor,
        pieTitleTextColor: style.color, pieLegendTextColor: style.color, pieOpacity: '1',
        ...seriesVariables, xyChart: { plotColorPalette: series.join(',') },
      },
    });
    const { svg } = await mermaid.render(`diagram-${crypto.randomUUID()}`, source);
    const drawing = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
    if (drawing.localName !== 'svg' || drawing.querySelector('parsererror, foreignObject, a, script, image')) throw new Error('Unsupported diagram output.');
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
  queue = render.then(() => {}, () => {});
  return render;
}
