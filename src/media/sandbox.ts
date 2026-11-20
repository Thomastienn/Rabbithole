// Runs inside the visual frame: opaque origin (sandbox="allow-scripts" only) with its own CSP, so visual code
// cannot reach app storage, DOM, cookies or the network. Only the libraries below are available to it.
import mermaid from 'mermaid';
import * as THREE from 'three';
import katex from 'katex';
import * as d3 from 'd3';
import { gsap } from 'gsap';
import { renderVisual } from './visualMarkup';
import { reflectSvgHidden, stepThrough } from './stepThrough';
import { trackPointerHandlers, watchParts } from './visualParts';
import 'katex/dist/katex.min.css';
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/600.css';
import '@fontsource/atkinson-hyperlegible-next/400.css';

mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
Object.assign(window, {
    mermaid,
    THREE,
    katex,
    d3,
    gsap,
    stepThrough,
});
reflectSvgHidden(window);
trackPointerHandlers(window);
const root = document.getElementById('visual')!,
    tokens = document.head.appendChild(document.createElement('style'));
let rendered = false;
let complete = false;
let room = Infinity;

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
    if (data?.type === 'fit' && typeof data.room === 'number' && data.room > 0) {
        room = data.room;
        report();
    }
    if (data?.type === 'render' && typeof data.source === 'string' && !complete) {
        rendered = true;
        complete = data.complete === true;
        renderVisual(root, data.source, complete);
    }
    if (
        data?.type === 'marks' &&
        Array.isArray(data.trails) &&
        data.trails.every((t: unknown) => Array.isArray(t) && t.every((n) => typeof n === 'string'))
    )
        drew.mark(data.trails);
    if (data?.type === 'step' && Number.isInteger(data.step) && data.step >= 0)
        drew.step(data.step);
});

// The host validates these height reports and the part messages below against this frame's window.
// A visual taller than the host's room scales down to fit, but never below half size.
function report() {
    if (!rendered) return;
    const natural = document.body.offsetHeight,
        scale = Math.max(0.5, Math.min(1, room / natural));
    document.body.style.transform = scale < 1 ? `scale(${scale})` : '';
    parent.postMessage({ type: 'height', height: Math.ceil(natural * scale) }, '*');
}
new ResizeObserver(report).observe(document.body);
const drew = watchParts(window, root, (message) => parent.postMessage(message, '*'));
type Frame = Parameters<typeof drew>;
// three.js sets render on each instance, so this subclass wraps it to learn each canvas's scene and camera.
class WebGLRenderer extends THREE.WebGLRenderer {
    constructor(...args: unknown[]) {
        super(...args);
        const render = this.render;
        this.render = (scene: Frame[1], camera: Frame[2]) => {
            render.call(this, scene, camera);
            // Picking never breaks the visual's animation loop.
            try {
                drew(this.domElement, scene, camera);
            } catch {
                /* no part this frame */
            }
        };
    }
}
Object.assign(window, { THREE: { ...THREE, WebGLRenderer } });
