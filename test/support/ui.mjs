// Missing browser APIs only; these stubs do not prove CSS geometry, native gestures or modal trapping.
export function ui(w, { mobile = false } = {}) {
    const frames = new Map(),
        media = new Map();
    let next = 0;
    w.requestAnimationFrame = (fn) => (frames.set(++next, fn), next);
    w.cancelAnimationFrame = (id) => frames.delete(id);
    w.ResizeObserver = class {
        observe() {}
        disconnect() {}
        unobserve() {}
    };
    w.matchMedia = (query) => {
        if (!media.has(query)) {
            const m = new w.EventTarget();
            m.matches = query.includes('max-width') ? mobile : query.includes('reduced-motion');
            m.media = query;
            media.set(query, m);
        }
        return media.get(query);
    };
    w.Element.prototype.scrollIntoView = () => {};
    w.Element.prototype.checkVisibility = function () {
        return !this.closest('[hidden], dialog:not([open])');
    };
    w.CSS = { escape: (s) => s.replace(/[^\w-]/g, (c) => `\\${c}`) };
    w.HTMLDialogElement.prototype.showModal = function () {
        this.open = true;
    };
    w.HTMLDialogElement.prototype.close = function () {
        this.open = false;
        this.dispatchEvent(new w.Event('close'));
    };
    return {
        frames() {
            const batch = [...frames];
            frames.clear();
            for (const [, fn] of batch) fn(0);
        },
        media(query, matches) {
            const m = w.matchMedia(query);
            m.matches = matches;
            m.dispatchEvent(new w.Event('change'));
        },
    };
}

export const name = (e) => e.getAttribute('aria-label') || e.textContent.trim();
export const button = (root, label) =>
    [...root.querySelectorAll('button')].find((e) => name(e) === label);
export function inputValue(input, value) {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(
        input,
        value,
    );
    input.dispatchEvent(new Event('input', { bubbles: true }));
}
