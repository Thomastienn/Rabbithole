// Mockup only. Draws the knowledge graph for Rabbithole-mkg.6 and Rabbithole-mkg.7 from one data set,
// so both pages show the same topics, hues and hulls. Coordinates stand in for the PCA anchors plus the force layout.
const KG = {
  // name, x, y, familiarity (0 new, 1 getting there, 2 known)
  topics: {
    Mycology: [["Hyphae", 150, 120, 2], ["Mycelium", 262, 96, 2], ["Spores", 118, 214, 1], ["Fruiting body", 258, 196, 0]],
    Fermentation: [["Yeast", 96, 370, 1], ["Leavening", 196, 420, 0], ["Carbon dioxide", 104, 486, 0]],
    Ecology: [["Mutualism", 360, 268, 1], ["Symbiosis", 462, 250, 2], ["Partner choice", 360, 360, 0], ["Mycorrhiza", 468, 340, 1]],
    "Plant biology": [["Root hair", 478, 92, 2], ["Phosphorus uptake", 586, 142, 1], ["Photosynthesis", 642, 64, 2]],
    "Soil chemistry": [["Soil pH", 360, 470, 0], ["Phosphate", 466, 452, 1], ["Cation exchange", 430, 540, 0]],
    "Orbital mechanics": [["Delta-v", 640, 420, 1], ["Hohmann transfer", 690, 500, 0]],
  },
  loose: [["Scientific method", 620, 290, 2]],
  builds: [["Hyphae", "Mycelium"], ["Spores", "Fruiting body"], ["Mycelium", "Mycorrhiza"], ["Mutualism", "Symbiosis"], ["Symbiosis", "Mycorrhiza"],
    ["Root hair", "Phosphorus uptake"], ["Phosphate", "Phosphorus uptake"], ["Soil pH", "Phosphate"], ["Yeast", "Leavening"],
    ["Carbon dioxide", "Leavening"], ["Delta-v", "Hohmann transfer"], ["Photosynthesis", "Root hair"]],
  related: [["Hyphae", "Yeast"], ["Mycorrhiza", "Root hair"], ["Partner choice", "Mutualism"], ["Hyphae", "Spores"], ["Phosphate", "Mycorrhiza"]],
};

// Topic hues: spread round the wheel in anchor-angle order, so neighbouring topics get neighbouring hues.
KG.hues = (() => {
  const names = Object.keys(KG.topics);
  const anchor = (t) => {
    const ps = KG.topics[t];
    return [ps.reduce((s, p) => s + p[1], 0) / ps.length, ps.reduce((s, p) => s + p[2], 0) / ps.length];
  };
  const all = names.map(anchor);
  const cx = all.reduce((s, a) => s + a[0], 0) / all.length, cy = all.reduce((s, a) => s + a[1], 0) / all.length;
  const order = names.map((t, i) => [t, Math.atan2(all[i][1] - cy, all[i][0] - cx)]).sort((a, b) => a[1] - b[1]);
  return new Map(order.map(([t], i) => [t, Math.round((250 + (i * 360) / names.length) % 360)]));
})();

document.head.insertAdjacentHTML("beforeend", `<style>
/* Topic hue mixed toward the theme's ink so it reads on light and dark variants. */
.kg .tp { --hue: color-mix(in oklch, light-dark(oklch(0.5 0.13 var(--h)), oklch(0.8 0.12 var(--h))) 85%, var(--ink)); }
.kg .tp.none { --hue: var(--w); }
.kg .hull { fill: var(--hue); stroke: var(--hue); stroke-width: 44; stroke-linejoin: round; opacity: 0.12; }
html:has(#lt:checked) .kg .hull, .lightbox .kg .hull { opacity: 0.17; }
.kg .tl { font: 600 12px var(--cond); letter-spacing: 0.07em; text-transform: uppercase; fill: var(--mut); text-anchor: middle; }
.kg .ln { stroke-width: 1.5; stroke-linecap: round; fill: none; }
.kg .ln.b { stroke: var(--mut); } .kg .ln.r { stroke: var(--seam2); } .kg .ln.s { stroke: var(--w); stroke-width: 2; }
.kg .ring { fill: none; stroke: var(--hue); stroke-width: 2.5; }
.kg .base { fill: var(--deep); } .kg .fill { fill: var(--hue); }
.kg .sel { fill: none; stroke: var(--w); stroke-width: 2; }
.kg .cl { font: 600 13px var(--cond); fill: var(--ink); text-anchor: middle; }
.kg .cl.on { font-size: 15px; fill: var(--w); }
</style>`);

let kgCount = 0;
function drawGraph(svg, { labels = true, selected = "Hyphae" } = {}) {
  const NS = "http://www.w3.org/2000/svg", id = `kg${kgCount++}`;
  const el = (tag, attrs, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    parent.append(e);
    return e;
  };
  svg.setAttribute("viewBox", "0 0 780 600");
  svg.classList.add("kg");
  const defs = el("defs", {}, svg);
  for (const [m, fill] of [["b", "var(--mut)"], ["s", "var(--w)"]]) {
    const mk = el("marker", { id: `${id}${m}`, viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto" }, defs);
    el("path", { d: "M0 0 10 5 0 10z", style: `fill:${fill}` }, mk);
  }
  const at = new Map();
  const groups = [...Object.entries(KG.topics).map(([t, ps]) => [t, ps]), [null, KG.loose]];
  for (const [t, ps] of groups) for (const p of ps) at.set(p[0], p);
  const hulls = el("g", {}, svg), links = el("g", {}, svg), points = el("g", {}, svg);

  for (const [t, ps] of groups) {
    if (!t) continue;
    const g = el("g", { class: "tp", style: `--h:${KG.hues.get(t)}` }, hulls);
    const pts = ps.flatMap(([n, x, y]) => {
      const w = labels ? n.length * 3.4 : 0;
      return labels ? [[x, y - 8], [x - w, y + 28], [x + w, y + 28]] : [[x, y - 8], [x - 8, y + 8], [x + 8, y + 8]];
    });
    el("path", { class: "hull", d: "M" + hull(pts).map((p) => p.join(" ")).join("L") + "Z" }, g);
    const top = Math.min(...pts.map((p) => p[1])), mid = ps.reduce((s, p) => s + p[1], 0) / ps.length;
    const lab = el("text", { class: "tl", x: Math.round(mid), y: Math.round(top - 30), style: labels ? "" : "font-size:22px" }, g);
    lab.textContent = t;
  }

  const touches = (a, b) => a === selected || b === selected;
  for (const [kind, list] of [["b", KG.builds], ["r", KG.related]]) for (const [a, b] of list) {
    const [, x1, y1] = at.get(a), [, x2, y2] = at.get(b);
    const d = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / d, uy = (y2 - y1) / d, cut = 11;
    const s = touches(a, b);
    el("line", {
      class: `ln ${s ? "s" : kind}`, x1: x1 + ux * cut, y1: y1 + uy * cut, x2: x2 - ux * cut, y2: y2 - uy * cut,
      ...(kind === "b" ? { "marker-end": `url(#${id}${s ? "s" : "b"})` } : {}),
    }, links);
  }

  for (const [t, ps] of groups) {
    const g = el("g", { class: t ? "tp" : "tp none", style: t ? `--h:${KG.hues.get(t)}` : "" }, points);
    for (const [n, x, y, f] of ps) {
      el("circle", { class: "base", cx: x, cy: y, r: 7 }, g);
      if (f === 2) el("circle", { class: "fill", cx: x, cy: y, r: 7 }, g);
      if (f === 1) el("path", { class: "fill", d: `M${x} ${y - 7}A7 7 0 0 0 ${x} ${y + 7}Z` }, g);
      el("circle", { class: "ring", cx: x, cy: y, r: 7 }, g);
      if (n === selected) el("circle", { class: "sel", cx: x, cy: y, r: 13 }, g);
      if (labels || n === selected) el("text", { class: n === selected ? "cl on" : "cl", x, y: y + 26 }, g).textContent = n;
    }
  }
}

// Monotone chain convex hull.
function hull(points) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list) => {
    const out = [];
    for (const q of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], q) <= 0) out.pop();
      out.push(q);
    }
    return out.slice(0, -1);
  };
  return [...half(p), ...half([...p].reverse())];
}

for (const svg of document.querySelectorAll("svg[data-graph]")) {
  drawGraph(svg, { labels: svg.dataset.graph !== "far", selected: svg.dataset.selected ?? "Hyphae" });
}
