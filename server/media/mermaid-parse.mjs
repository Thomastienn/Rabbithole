import { parentPort, workerData } from 'node:worker_threads';
import { JSDOM } from 'jsdom';

export async function parseDiagram(source) {
    // Mermaid's label sanitizer needs a DOM; no scripts or resource loading.
    const dom = new JSDOM('');
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    try {
        const { default: mermaid } = await import('mermaid');
        mermaid.initialize({
            startOnLoad: false,
            securityLevel: 'strict',
            htmlLabels: false,
            maxTextSize: 16 * 1024,
        });
        return !!(await mermaid.parse(source, { suppressErrors: true }));
    } catch {
        return false;
    } finally {
        dom.window.close();
    }
}

if (parentPort) parentPort.postMessage(await parseDiagram(workerData));
