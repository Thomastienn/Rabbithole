// Runs inside the visual frame: opaque origin (sandbox="allow-scripts" only) with its own CSP, so visual code
// cannot reach app storage, DOM, cookies or the network. Only the libraries below are available to it.
import mermaid from 'mermaid';
import * as THREE from 'three';
import katex from 'katex';
import * as d3 from 'd3';
import { renderVisual } from './visualMarkup';
import { stepThrough } from './stepThrough';
import 'katex/dist/katex.min.css';
import '@fontsource/archivo/400.css';
import '@fontsource/archivo/600.css';
import '@fontsource/literata/400.css';

mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
Object.assign(window, { mermaid, THREE, katex, d3, stepThrough });
const root = document.getElementById('visual')!,
  tokens = document.head.appendChild(document.createElement('style'));
let rendered = false;
let complete = false;

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
    dispatchEvent(new Event('rabbithole-theme'));
  }
  if (data?.type === 'render' && typeof data.source === 'string' && !complete) {
    rendered = true;
    complete = data.complete === true;
    renderVisual(root, data.source, complete);
  }
});

// The host validates these height reports against this frame's window; it accepts no other frame message.
new ResizeObserver(() => {
  if (rendered)
    parent.postMessage(
      { type: 'height', height: Math.ceil(document.body.getBoundingClientRect().height) },
      '*',
    );
}).observe(document.body);
