// Mount a React element into a fresh jsdom document; call cleanup() when the test ends.
import { JSDOM } from 'jsdom';

const GLOBALS = [
    'window',
    'document',
    'navigator',
    'localStorage',
    'Node',
    'Element',
    'HTMLElement',
    'HTMLInputElement',
    'HTMLTextAreaElement',
    'HTMLSelectElement',
    'HTMLDialogElement',
    'SVGElement',
    'ResizeObserver',
    'CSS',
    'Event',
    'MouseEvent',
    'KeyboardEvent',
    'FocusEvent',
    'MutationObserver',
    'getComputedStyle',
    'requestAnimationFrame',
    'cancelAnimationFrame',
    'addEventListener',
    'removeEventListener',
];

export async function render(element, setup = () => {}) {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
        pretendToBeVisual: true,
        url: 'http://localhost/',
    });
    setup(dom.window);
    const saved = GLOBALS.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
    for (const key of GLOBALS) {
        const value = dom.window[key];
        Object.defineProperty(globalThis, key, {
            configurable: true,
            writable: true,
            // Bare calls like addEventListener() need the window as `this`; constructors stay as they are.
            value:
                typeof value === 'function' && !/^[A-Z]/.test(key) ? value.bind(dom.window) : value,
        });
    }
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    // react-dom reads window/document at import time, so load it after the globals exist.
    const [{ act }, { createRoot }] = await Promise.all([
        import('react'),
        import('react-dom/client'),
    ]);
    const container = document.body.appendChild(document.createElement('div'));
    const root = createRoot(container);
    await act(async () => root.render(element));
    return {
        container,
        act,
        async cleanup() {
            await act(async () => root.unmount());
            dom.window.close();
            for (const [key, descriptor] of saved)
                descriptor
                    ? Object.defineProperty(globalThis, key, descriptor)
                    : delete globalThis[key];
            delete globalThis.IS_REACT_ACT_ENVIRONMENT;
        },
    };
}
