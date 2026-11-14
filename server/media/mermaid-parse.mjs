import { parentPort, workerData } from 'node:worker_threads';
import { JSDOM } from 'jsdom';

// Mermaid's label sanitizer needs a DOM. This parse-only worker has no scripts or resource loading.
const dom = new JSDOM('');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
const { default: mermaid } = await import('mermaid');
mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'strict',
  htmlLabels: false,
  maxTextSize: 16 * 1024,
});
try {
  parentPort.postMessage(!!(await mermaid.parse(workerData, { suppressErrors: true })));
} catch {
  parentPort.postMessage(false);
} finally {
  dom.window.close();
}
