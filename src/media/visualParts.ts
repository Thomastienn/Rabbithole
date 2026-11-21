// Runs inside the visual frame: reads the visual's named parts (data-part, nested, or flagged three.js
// objects) and reports the part under the pointer and a click on it to the host, which validates every message.
// While the host picks from the keyboard, it also reports the whole part tree.
import { Box3, Raycaster, Vector2, Vector3 } from 'three';
import { PART_DEPTH } from './artifacts';
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
const control = (e: Element) =>
    e.matches(CONTROLS) ||
    handled.has(e) ||
    POINTER.some((type) => (e as unknown as Record<string, unknown>)[`on${type}`]);

// The named parts holding target, outermost first and at most three; none under a control.
function trail(target: EventTarget | null, root: Element) {
    const parts: Element[] = [];
    for (let e = target as Element | null; e && e !== root; e = e.parentElement) {
        if (control(e)) return;
        if (nameOf(e)) parts.unshift(e);
    }
    return parts.length ? parts.slice(-PART_DEPTH) : undefined;
}
// A part in the tree the host picks from with the keyboard, down to the third level.
type Node = { name: string; box: Box; parts: Node[] };
const isDrawn = (e: Element, box: DOMRect) =>
    box.width > 0 &&
    box.height > 0 &&
    e.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) !== false;
// The drawn named parts directly inside e, none under a control.
const domParts = (e: Element, depth = 1): Node[] =>
    [...e.children].flatMap((c) => {
        if (control(c)) return [];
        if (!nameOf(c)) return domParts(c, depth);
        const box = c.getBoundingClientRect();
        return depth <= PART_DEPTH && isDrawn(c, box)
            ? [{ name: nameOf(c)!, box, parts: domParts(c, depth + 1) }]
            : [];
    });

type Box = { left: number; top: number; right: number; bottom: number };
const stepOf = (steps: Element | null) => {
    const step = steps?.getAttribute('data-step');
    return step ? Number(step) : null;
};
// The three.js shapes used here; the module itself is untyped (src/vite-env.d.ts).
type Object3D = {
    name: string;
    visible: boolean;
    parent: Object3D | null;
    children: Object3D[];
    userData: Record<string, unknown>;
    traverseVisible(visit: (o: Object3D) => void): void;
};
type Camera = object;
type Scene = { scene: Object3D; camera: Camera };
const raycaster = new Raycaster();
const shown = (o: Object3D | null): boolean => !o || (o.visible && shown(o.parent));
const flagged = (o: Object3D) => o.userData.part === true && !!o.name.trim();
// The flagged objects holding o, o included, outermost first and at most three.
function objectTrail(o: Object3D | null, scene: Object3D) {
    const parts: Object3D[] = [];
    for (; o && o !== scene; o = o.parent) if (flagged(o)) parts.unshift(o);
    return parts.slice(-PART_DEPTH);
}

// An object's on-screen box, clamped to the canvas.
function screenBox(o: Object3D, camera: Camera, canvas: Box) {
    const width = canvas.right - canvas.left,
        height = canvas.bottom - canvas.top;
    const b = new Box3().setFromObject(o),
        box = {
            left: canvas.right,
            top: canvas.bottom,
            right: canvas.left,
            bottom: canvas.top,
        };
    // shortcut: corners behind the camera project wrongly; clamping hides it, upgrade if boxes jump.
    for (let i = 0; i < 8; i++) {
        const p = new Vector3(
                i & 1 ? b.max.x : b.min.x,
                i & 2 ? b.max.y : b.min.y,
                i & 4 ? b.max.z : b.min.z,
            ).project(camera),
            px = Math.min(
                canvas.right,
                Math.max(canvas.left, canvas.left + ((p.x + 1) / 2) * width),
            ),
            py = Math.min(
                canvas.bottom,
                Math.max(canvas.top, canvas.top + ((1 - p.y) / 2) * height),
            );
        box.left = Math.min(box.left, px);
        box.right = Math.max(box.right, px);
        box.top = Math.min(box.top, py);
        box.bottom = Math.max(box.bottom, py);
    }
    return box;
}
// The visible flagged objects directly inside o.
const sceneParts = (o: Object3D, camera: Camera, canvas: Box, depth = 1): Node[] =>
    o.children
        .filter((c) => c.visible)
        .flatMap((c) =>
            !flagged(c)
                ? sceneParts(c, camera, canvas, depth)
                : depth <= PART_DEPTH
                  ? [
                        {
                            name: c.name.trim(),
                            box: screenBox(c, camera, canvas),
                            parts: sceneParts(c, camera, canvas, depth + 1),
                        },
                    ]
                  : [],
        );

// The flagged objects (userData.part) holding the nearest visible object under the pointer,
// outermost first and at most three, each with its on-screen box clamped to the canvas.
function sceneTrail({ scene, camera }: Scene, canvas: Box, x: number, y: number) {
    const width = canvas.right - canvas.left,
        height = canvas.bottom - canvas.top;
    raycaster.setFromCamera(
        new Vector2(((x - canvas.left) / width) * 2 - 1, 1 - ((y - canvas.top) / height) * 2),
        camera,
    );
    const hit = raycaster.intersectObject(scene).find((h: { object: Object3D }) => shown(h.object));
    const parts = objectTrail(hit?.object ?? null, scene).map((o) => ({
        name: o.name.trim(),
        box: screenBox(o, camera, canvas),
    }));
    return parts.length ? parts : undefined;
}

// Returns drew, which the sandbox's three.js renderer calls after each frame it draws on a canvas,
// with mark and step for the host's branched parts.
export function watchParts(
    view: Window & typeof globalThis,
    root: Element,
    post: (message: object) => void,
) {
    const document = view.document;
    const scenes = new Map<Element, Scene>();
    // Bounds are clipped to the frame's viewport, the only area the host accepts.
    const clip = ({ name, box: r }: { name: string; box: Box }) => {
        const x = Math.max(0, r.left),
            y = Math.max(0, r.top);
        return {
            name,
            x,
            y,
            width: Math.max(0, Math.min(view.innerWidth, r.right) - x),
            height: Math.max(0, Math.min(view.innerHeight, r.bottom) - y),
        };
    };
    // A canvas drawing a scene picks by raycast, even with its own orbit handlers.
    const describe = (target: EventTarget | null, x: number, y: number) => {
        const scene = target instanceof view.Element ? scenes.get(target) : undefined;
        if (scene)
            return sceneTrail(scene, (target as Element).getBoundingClientRect(), x, y)?.map(clip);
        return trail(target, root)?.map((e) =>
            clip({ name: nameOf(e)!, box: e.getBoundingClientRect() }),
        );
    };
    let last = 'null',
        pointer: { target: EventTarget | null; x: number; y: number } | undefined,
        down = { x: 0, y: 0 };
    const hover = (parts: ReturnType<typeof describe>) => {
        document.documentElement.classList.toggle('tt-pick', !!parts);
        const key = JSON.stringify(parts ?? null);
        if (key === last) return;
        last = key;
        post(parts ? { type: 'part', parts } : { type: 'leave' });
    };
    document.addEventListener('pointermove', (event) => {
        pointer = { target: event.target, x: event.clientX, y: event.clientY };
        hover(describe(event.target, event.clientX, event.clientY));
    });
    document.documentElement.addEventListener('pointerleave', () => {
        pointer = undefined;
        hover(undefined);
    });
    document.addEventListener(
        'pointerdown',
        (event) => (down = { x: event.clientX, y: event.clientY }),
        true,
    );
    document.addEventListener('click', (event) => {
        // A click ending a drag, such as orbiting the camera, never picks.
        if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > 4) return;
        const parts = describe(event.target, event.clientX, event.clientY);
        if (!parts) return;
        post({ type: 'pick', parts, step: stepOf((event.target as Element).closest('.tt-steps')) });
    });

    // Branched parts the host marks: the first drawn part with each trail, re-measured whenever the visual changes.
    let marked: string[] = [],
        wanted: number | undefined,
        queued = false,
        lastMarks = '[]',
        // The part tree, posted on each change while the host picks from the keyboard.
        watching = false,
        lastTree = '';
    const bounds = (r: Box) => {
        const { name: _, ...box } = clip({ name: '', box: r });
        return box;
    };
    const measure = () => {
        queued = false;
        const controls = wanted !== undefined && document.querySelector('.tt-steps');
        if (controls) {
            controls.dispatchEvent(new view.CustomEvent('tt-show', { detail: wanted }));
            wanted = undefined;
        }
        if (watching) postTree();
        const drawn = new Map<string, ReturnType<typeof bounds>>();
        const add = (names: string[], box: ReturnType<typeof bounds>) => {
            const key = JSON.stringify(names);
            if (marked.includes(key) && !drawn.has(key) && box.width && box.height)
                drawn.set(key, box);
        };
        for (const e of root.querySelectorAll('[data-part]')) {
            const parts = nameOf(e) && trail(e, root),
                r = e.getBoundingClientRect();
            if (parts && isDrawn(e, r))
                add(
                    parts.map((p) => nameOf(p)!),
                    bounds(r),
                );
        }
        // A scene's flagged objects, as a click on each would name them.
        for (const [canvas, { scene, camera }] of scenes)
            if (canvas.isConnected)
                scene.traverseVisible((o) => {
                    if (flagged(o))
                        add(
                            objectTrail(o, scene).map((p) => p.name.trim()),
                            bounds(screenBox(o, camera, canvas.getBoundingClientRect())),
                        );
                });
        const marks = marked
                .filter((key) => drawn.has(key))
                .map((key) => ({ trail: JSON.parse(key), ...drawn.get(key)! })),
            key = JSON.stringify(marks);
        if (key === lastMarks) return;
        lastMarks = key;
        post({ type: 'marks', marks });
    };
    const out = (n: Node): object => ({ ...clip(n), parts: n.parts.map(out) });
    const postTree = () => {
        const parts = [
                ...domParts(root),
                ...[...scenes].flatMap(([canvas, { scene, camera }]) =>
                    canvas.isConnected
                        ? sceneParts(scene, camera, canvas.getBoundingClientRect())
                        : [],
                ),
            ].map(out),
            step = stepOf(document.querySelector('.tt-steps')),
            key = JSON.stringify([parts, step]);
        if (key === lastTree) return;
        lastTree = key;
        post({ type: 'tree', parts, step });
    };
    const schedule = () => {
        if (queued || (!marked.length && wanted === undefined && !watching)) return;
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
    // Each frame re-reads the hovered object, the marks and the tree, so their rectangles follow the camera.
    function drew(canvas: Element, scene: Object3D, camera: Camera) {
        scenes.set(canvas, { scene, camera });
        if (pointer?.target === canvas) hover(describe(canvas, pointer.x, pointer.y));
        schedule();
    }
    return Object.assign(drew, {
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
        watch(on: boolean) {
            watching = on;
            lastTree = '';
            schedule();
        },
    });
}
