// Runs inside the visual frame: opaque origin (sandbox="allow-scripts" only) with its own CSP, so visual code
// cannot reach app storage, DOM, cookies or the network. Only the libraries below are available to it.
import mermaid from 'mermaid';
import * as THREE from 'three';
import katex from 'katex';
import * as d3 from 'd3';
import 'katex/dist/katex.min.css';
import '@fontsource/public-sans/400.css';
import '@fontsource/public-sans/600.css';
import '@fontsource/source-serif-4/400.css';

mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
Object.assign(window, { mermaid, THREE, katex, d3 });
const root = document.getElementById('visual')!, tokens = document.head.appendChild(document.createElement('style'));
let rendered = false;

addEventListener('message', event => {
  if (event.source !== parent) return;
  const data = event.data;
  if (data?.type === 'theme' && (data.scheme === 'light' || data.scheme === 'dark') && data.tokens && typeof data.tokens === 'object') {
    const rules = Object.entries(data.tokens).filter(([k, v]) => /^--[\w-]+$/.test(k) && typeof v === 'string' && !/[;{}<]/.test(v)).map(([k, v]) => `${k}:${v}`);
    tokens.textContent = `:root{color-scheme:${data.scheme};${rules.join(';')}}`;
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
  }
});

// Height is the only message the page itself sends; the app clamps and validates it.
new ResizeObserver(() => parent.postMessage({ type: 'height', height: Math.ceil(document.body.getBoundingClientRect().height) }, '*')).observe(document.body);
