// Runs inside the visual frame: opaque origin (sandbox="allow-scripts" only) with its own CSP, so visual code
// cannot reach app storage, DOM, cookies or the network. Only the libraries below are available to it.
import mermaid from 'mermaid';
import * as THREE from 'three';
import katex from 'katex';
import * as d3 from 'd3';
import type { VisualPart } from './artifacts';
import { activatedPart, tagParts } from './visualParts';
import 'katex/dist/katex.min.css';
import '@fontsource/archivo/400.css';
import '@fontsource/archivo/600.css';
import '@fontsource/literata/400.css';

mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
Object.assign(window, { mermaid, THREE, katex, d3 });
const root = document.getElementById('visual')!,
  tokens = document.head.appendChild(document.createElement('style'));
let rendered = false;
let explored: VisualPart[] = [];
let reveal: VisualPart | undefined;
let revealPending = false;
const tag = () => {
  revealPending = tagParts(root, explored, reveal, revealPending);
};
function activate(event: MouseEvent | KeyboardEvent) {
  const part = activatedPart(root, event);
  if (!part) return;
  event.preventDefault();
  parent.postMessage(part, '*');
}
root.addEventListener('click', activate);
root.addEventListener('keydown', activate);
new MutationObserver(tag).observe(root, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['data-visual-label', 'data-visual-explanation'],
});

addEventListener('message', (event) => {
  if (event.source !== parent) return;
  const data = event.data;
  if (
    data?.type === 'theme' &&
    (data.scheme === 'light' || data.scheme === 'dark') &&
    data.tokens &&
    typeof data.tokens === 'object'
  ) {
    const rules = Object.entries(data.tokens)
      .filter(([k, v]) => /^--[\w-]+$/.test(k) && typeof v === 'string' && !/[;{}<]/.test(v))
      .map(([k, v]) => `${k}:${v}`);
    tokens.textContent = `:root{color-scheme:${data.scheme};${rules.join(';')}}`;
    dispatchEvent(new Event('treetutor-theme'));
  }
  if (data?.type === 'render' && typeof data.source === 'string' && !rendered) {
    rendered = true;
    root.innerHTML = data.source;
    // innerHTML never runs scripts; recreate each so the fragment's own code runs in document order.
    for (const old of root.querySelectorAll('script')) {
      const script = document.createElement('script');
      for (const { name, value } of old.attributes) script.setAttribute(name, value);
      script.textContent = old.textContent;
      old.replaceWith(script);
    }
    tag();
  }
  if (data?.type === 'parts' && Array.isArray(data.explored)) {
    explored = data.explored;
    reveal = data.reveal;
    revealPending = !!reveal;
    tag();
  }
});

// The host validates these height reports and tagged-part branch requests against this frame's window.
new ResizeObserver(() => {
  if (rendered)
    parent.postMessage(
      { type: 'height', height: Math.ceil(document.body.getBoundingClientRect().height) },
      '*',
    );
}).observe(document.body);
