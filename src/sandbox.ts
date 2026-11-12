// Runs inside the visual frame: opaque origin (sandbox="allow-scripts" only) with its own CSP, so visual code
// cannot reach app storage, DOM, cookies or the network. Only the libraries below are available to it.
import mermaid from 'mermaid';
import * as THREE from 'three';
import katex from 'katex';
import * as d3 from 'd3';
import { visualMessage, type VisualPart } from './artifacts';
import 'katex/dist/katex.min.css';
import '@fontsource/public-sans/400.css';
import '@fontsource/public-sans/600.css';
import '@fontsource/source-serif-4/400.css';

mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
Object.assign(window, { mermaid, THREE, katex, d3 });
const root = document.getElementById('visual')!, tokens = document.head.appendChild(document.createElement('style'));
let rendered = false;
let explored: VisualPart[] = [];
let reveal: VisualPart | undefined;
let revealPending = false;
const partOf = (element: Element) => {
  const part = visualMessage({ type: 'branch', label: element.getAttribute('data-visual-label'), explanation: element.getAttribute('data-visual-explanation') });
  return part?.type === 'branch' ? part : undefined;
};
const same = (a: VisualPart, b?: VisualPart) => a.label === b?.label && a.explanation === b.explanation;
function tagParts() {
  for (const element of root.querySelectorAll('[data-visual-label][data-visual-explanation]')) {
    const part = partOf(element);
    if (!part || element.matches('input, select, textarea, [contenteditable]')) continue;
    element.setAttribute('tabindex', '0');
    if (!element.matches('button')) element.setAttribute('role', 'button');
    const visited = explored.some(p => same(part, p));
    element.toggleAttribute('data-visual-explored', visited);
    element.toggleAttribute('data-visual-reveal', same(part, reveal));
    element.setAttribute('aria-label', `${visited ? 'Open explored branch' : 'Ask about'}: ${part.label}`);
    element.setAttribute('aria-description', part.explanation);
    if (revealPending && same(part, reveal)) {
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        if (parent instanceof HTMLDetailsElement) parent.open = true;
      }
      (element as HTMLElement).scrollIntoView({ block: 'center' });
      (element as HTMLElement).focus();
      revealPending = false;
    }
  }
}
function activate(event: MouseEvent | KeyboardEvent) {
  const target = event.target instanceof Element ? event.target : null;
  const element = target?.closest('[data-visual-label][data-visual-explanation]');
  if (!element || !root.contains(element) || element.matches('input, select, textarea, [contenteditable], :disabled, [aria-disabled=true]')) return;
  const control = target?.closest('button, input, select, textarea, a, [contenteditable]');
  if (control && control !== element) return;
  if (event instanceof KeyboardEvent && (event.repeat || element.matches('button') || !['Enter', ' '].includes(event.key))) return;
  const part = partOf(element);
  if (!part) return;
  event.preventDefault();
  parent.postMessage(part, '*');
}
root.addEventListener('click', activate);
root.addEventListener('keydown', activate);
new MutationObserver(tagParts).observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-visual-label', 'data-visual-explanation'] });

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
    tagParts();
  }
  if (data?.type === 'parts' && Array.isArray(data.explored)) {
    explored = data.explored;
    reveal = data.reveal;
    revealPending = !!reveal;
    tagParts();
  }
});

// The host validates these height reports and tagged-part branch requests against this frame's window.
new ResizeObserver(() => { if (rendered) parent.postMessage({ type: 'height', height: Math.ceil(document.body.getBoundingClientRect().height) }, '*'); }).observe(document.body);
