import mermaid from 'mermaid';

// Mermaid has global configuration. Keep each theme initialization with its queued render.
let queue = Promise.resolve();
export function renderDiagram(source: string, style: CSSStyleDeclaration, dark: boolean): Promise<string> {
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
    // SVG images cannot execute scripts or follow links. No HTML insertion or bindFunctions.
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(drawing))}`;
  });
  queue = render.then(() => {}, () => {});
  return render;
}
