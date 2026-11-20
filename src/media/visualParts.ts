// Runs inside the visual frame: reads the visual's named parts (data-part, nested, or flagged three.js
// objects) and reports the part under the pointer and a click on it to the host, which validates every message.
import { Box3, Raycaster, Vector2, Vector3 } from 'three';
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

type Box = { left: number; top: number; right: number; bottom: number };
// The three.js shapes used here; the module itself is untyped (src/vite-env.d.ts).
type Object3D = {
    name: string;
    visible: boolean;
    parent: Object3D | null;
    userData: Record<string, unknown>;
};
type Camera = object;
type Scene = { scene: Object3D; camera: Camera };
const raycaster = new Raycaster();
const shown = (o: Object3D | null): boolean => !o || (o.visible && shown(o.parent));

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
    const parts: { name: string; box: Box }[] = [];
    for (let o = hit?.object ?? null; o && o !== scene; o = o.parent) {
        if (o.userData.part !== true || !o.name.trim()) continue;
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
        parts.unshift({ name: o.name.trim(), box });
    }
    return parts.length ? parts.slice(-3) : undefined;
}

// Returns drew, which the sandbox's three.js renderer calls after each frame it draws on a canvas.
export function watchParts(
    view: Window & typeof globalThis,
    root: Element,
    post: (message: object) => void,
) {
    const document = view.document;
    const scenes = new WeakMap<Element, Scene>();
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
        const step = (event.target as Element).closest('.tt-steps')?.getAttribute('data-step');
        post({ type: 'pick', parts, step: step ? Number(step) : null });
    });
    // Each frame re-reads the hovered object, so its rectangle follows the camera.
    return function drew(canvas: Element, scene: Object3D, camera: Camera) {
        scenes.set(canvas, { scene, camera });
        if (pointer?.target === canvas) hover(describe(canvas, pointer.x, pointer.y));
    };
}
