// Browser-side probe for the one-frame rule (docs/settings-redesign-spec.md, One frame per object):
// lists every visible element that draws a frame (four-sided border or ring) inside another framed element.
// One-sided rules (separators, ink rules, table row lines) and glyphs under 16px (step dots) are not frames;
// focus outlines are not checked.
export const nestedFrames = roots => `(() => {
  const clear = c => /^rgba\\(.*,\\s*0\\)$|^transparent$/.test(c);
  const framed = e => { const s = getComputedStyle(e);
    const border = ['Top', 'Right', 'Bottom', 'Left'].every(k => parseFloat(s['border' + k + 'Width']) > 0 && s['border' + k + 'Style'] !== 'none' && !clear(s['border' + k + 'Color']));
    const ring = s.boxShadow.split(/,(?![^(]*\\))/).some(r => !clear(r.match(/rgba?\\([^)]*\\)|#\\w+/)?.[0] ?? '') && /^(?:\\S+\\s+)?(?:inset\\s+)?0px 0px 0px [1-9]|0px 0px 0px [1-9][^,]*(inset)?$/.test(r.replace(/rgba?\\([^)]*\\)/, '').trim()));
    return border || ring; };
  const name = e => e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\\s+/).filter(c => !/^x[0-9a-z]{5,8}$/.test(c)).join('.') : '') + (e.getAttribute('aria-label') ? '[' + e.getAttribute('aria-label') + ']' : '');
  const out = [];
  for (const root of document.querySelectorAll(${JSON.stringify(roots)})) for (const e of [root, ...root.querySelectorAll('*')]) {
    const box = e.getBoundingClientRect();
    if (!e.checkVisibility() || (box.width < 16 && box.height < 16) || !framed(e)) continue;
    for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) if (framed(p)) { out.push(name(e) + ' in ' + name(p)); break; }
  }
  return [...new Set(out)];
})()`;
