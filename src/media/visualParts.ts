// Runs inside the visual frame: reads the visual's named parts (data-part, nested) and reports
// the part under the pointer and a click on it to the host, which validates every message.
const CONTROLS =
    'button, input, select, textarea, label, summary, a, [role=button], [role=slider], [contenteditable]';
const POINTER = [
    'click',
    'dblclick',
    'pointerdown',
    'pointerup',
    'mousedown',
    'mouseup',
    'touchstart',
];
const handled = new WeakSet<EventTarget>();

// Installed before a fragment runs, so elements given their own pointer handlers (d3's .on included) never pick.
export function trackPointerHandlers(view: Window & typeof globalThis) {
    const proto = view.EventTarget.prototype,
        add = proto.addEventListener;
    proto.addEventListener = function (this: EventTarget, ...args: Parameters<typeof add>) {
        if (POINTER.includes(args[0]) && this instanceof view.Element) handled.add(this);
        return add.apply(this, args);
    };
}

const nameOf = (e: Element) => e.getAttribute('data-part')?.trim();

// The named parts holding target, outermost first and at most three; none under a control.
function trail(target: EventTarget | null, root: Element) {
    const parts: Element[] = [];
    for (let e = target as Element | null; e && e !== root; e = e.parentElement) {
        if (
            e.matches(CONTROLS) ||
            handled.has(e) ||
            POINTER.some((type) => (e as unknown as Record<string, unknown>)[`on${type}`])
        )
            return;
        if (nameOf(e)) parts.unshift(e);
    }
    return parts.length ? parts.slice(-3) : undefined;
}

export function watchParts(
    view: Window & typeof globalThis,
    root: Element,
    post: (message: object) => void,
) {
    const document = view.document;
    // Bounds are clipped to the frame's viewport, the only area the host accepts.
    const bounds = (e: Element) => {
        const r = e.getBoundingClientRect(),
            x = Math.max(0, r.left),
            y = Math.max(0, r.top);
        return {
            x,
            y,
            width: Math.max(0, Math.min(view.innerWidth, r.right) - x),
            height: Math.max(0, Math.min(view.innerHeight, r.bottom) - y),
        };
    };
    const describe = (target: EventTarget | null) =>
        trail(target, root)?.map((e) => ({ name: nameOf(e)!, ...bounds(e) }));
    let last = 'null';
    const hover = (parts: ReturnType<typeof describe>) => {
        document.documentElement.classList.toggle('tt-pick', !!parts);
        const key = JSON.stringify(parts ?? null);
        if (key === last) return;
        last = key;
        post(parts ? { type: 'part', parts } : { type: 'leave' });
    };
    document.addEventListener('pointermove', (event) => hover(describe(event.target)));
    document.documentElement.addEventListener('pointerleave', () => hover(undefined));
    document.addEventListener('click', (event) => {
        const parts = describe(event.target);
        if (!parts) return;
        const step = (event.target as Element).closest('.tt-steps')?.getAttribute('data-step');
        post({ type: 'pick', parts, step: step ? Number(step) : null });
    });

    // Branched parts the host marks: the first drawn part with each trail, re-measured whenever the visual changes.
    let marked: string[] = [],
        wanted: number | undefined,
        queued = false,
        lastMarks = '[]';
    const measure = () => {
        queued = false;
        const controls = wanted !== undefined && document.querySelector('.tt-steps');
        if (controls) {
            controls.dispatchEvent(new view.CustomEvent('tt-show', { detail: wanted }));
            wanted = undefined;
        }
        const drawn = new Map<string, Element>();
        for (const e of root.querySelectorAll('[data-part]')) {
            const names: string[] = [];
            for (let p: Element | null = e; p && p !== root; p = p.parentElement)
                if (nameOf(p)) names.unshift(nameOf(p)!);
            const key = JSON.stringify(names.slice(-3)),
                box = bounds(e);
            if (
                marked.includes(key) &&
                !drawn.has(key) &&
                box.width &&
                box.height &&
                e.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) !== false
            )
                drawn.set(key, e);
        }
        const marks = marked
                .filter((key) => drawn.has(key))
                .map((key) => ({ trail: JSON.parse(key), ...bounds(drawn.get(key)!) })),
            key = JSON.stringify(marks);
        if (key === lastMarks) return;
        lastMarks = key;
        post({ type: 'marks', marks });
    };
    const schedule = () => {
        if (queued || (!marked.length && wanted === undefined)) return;
        queued = true;
        view.requestAnimationFrame(measure);
    };
    new view.MutationObserver(schedule).observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
    });
    for (const type of ['resize', 'transitionend', 'animationend'])
        view.addEventListener(type, schedule);
    return {
        mark(trails: string[][]) {
            marked = trails.map((t) => JSON.stringify(t));
            if (!marked.length) {
                if (lastMarks !== '[]') post({ type: 'marks', marks: [] });
                lastMarks = '[]';
            }
            schedule();
        },
        // Opens a step-through visual at a stored step, once its controls exist.
        step(index: number) {
            wanted = index;
            schedule();
        },
    };
}
