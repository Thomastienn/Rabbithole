// Shared step-through helper the visual frame installs before any fragment runs.
// A fragment calls stepThrough(root, steps); each step moves the visual to that state.
// A plain function continues the scene, and its changed parts pulse once the motion settles.
// { scene: true, show } crossfades: a still copy of the old scene fades out over root as show redraws it.
// Previous and Next sit beside root, not below it, so a step that resizes root does not push them away.
// Play walks the steps slowly with a hold on each; it starts only on the learner's click.
type Show = (state: { index: number; duration: number }) => void;
type Step = Show | { scene: true; show: Show };

const HOLD = 1000,
    PULSE = 900;
const PLAY = '<path d="M5 3v10l8-5z" fill="currentColor"/>',
    PAUSE =
        '<path d="M5 3v10M11 3v10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';
const icon = (shape: string) =>
    `<svg viewBox="0 0 16 16" width="20" height="20" aria-hidden="true">${shape}</svg>`;

export function stepThrough(root: HTMLElement, steps: Step[], duration = 600) {
    const document = root.ownerDocument,
        view = document.defaultView!,
        controls = document.createElement('div'),
        previous = document.createElement('button'),
        next = document.createElement('button'),
        play = document.createElement('button'),
        indicator = document.createElement('span');
    let index = 0,
        // A scene fade or a pulse watch still running from the last step.
        pending: { timer: number; run: () => void } | undefined,
        playing: number | undefined,
        // Play motion per step, 1.5 to 2.5 s by how many nodes the step changes; set by measure.
        motion: number[] = [];
    controls.className = 'tt-steps';
    controls.setAttribute('role', 'group');
    controls.setAttribute('aria-label', 'Steps');
    const label = (button: HTMLButtonElement, text: string, shape: string) => {
        button.type = 'button';
        button.setAttribute('aria-label', text);
        button.title = text;
        button.innerHTML = icon(shape);
    };
    const chevron = (path: string) =>
        `<path d="${path}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`;
    label(previous, 'Previous', chevron('M10 3 5 8l5 5'));
    label(next, 'Next', chevron('m6 3 5 5-5 5'));
    label(play, 'Play', PLAY);
    indicator.setAttribute('aria-live', 'polite');
    root.replaceWith(controls);
    controls.append(previous, root, next, play, indicator);

    const pause = () => {
        if (playing === undefined) return;
        view.clearTimeout(playing);
        playing = undefined;
        label(play, 'Play', PLAY);
    };
    // Under reduced motion steps switch instantly, but Play still waits the full step time.
    const advance = (target: number) => {
        const ms = motion[target] ?? 1500;
        show(target, ms);
        if (index === steps.length - 1) pause();
        else playing = view.setTimeout(() => advance(index + 1), ms + HOLD);
    };
    const toggle = () => {
        if (playing !== undefined) return pause();
        label(play, 'Pause', PAUSE);
        playing = 0; // marks Play on before the first step runs
        advance(index === steps.length - 1 ? 0 : index + 1);
    };
    const stepTo = (target: number, ms = duration) => {
        pause();
        show(target, ms);
    };

    const show = (target: number, motionMs: number) => {
        index = Math.max(0, Math.min(steps.length - 1, target));
        const ms = view.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : motionMs;
        root.style.setProperty('--step-duration', `${ms}ms`);
        // A step during a fade first finishes the pending scene so later steps start from it.
        if (pending) {
            view.clearTimeout(pending.timer);
            pending.run();
        }
        const step = steps[index],
            state = { index, duration: ms };
        if (!ms) (typeof step === 'function' ? step : step.show)(state);
        else if (typeof step === 'function') {
            const changed = new Set<Node>(),
                changes = new view.MutationObserver((records) =>
                    records.forEach((record) => changed.add(record.target)),
                );
            changes.observe(root, {
                subtree: true,
                childList: true,
                attributes: true,
                characterData: true,
            });
            step(state);
            const run = () => {
                pending = undefined;
                changes.disconnect();
            };
            const settle = () => {
                changes.takeRecords().forEach((record) => changed.add(record.target));
                run();
                pulse(changed);
            };
            pending = { timer: view.setTimeout(settle, ms), run };
        } else {
            // shortcut: a canvas copies blank, so a canvas scene fades in from empty; draw copies if that shows.
            const still = root.cloneNode(true) as HTMLElement;
            // The copy is never picked, focused or read; it keeps root's id so the visual's styles still apply.
            for (const e of [still, ...still.querySelectorAll('[data-part]')])
                e.removeAttribute('data-part');
            still.setAttribute('inert', '');
            still.setAttribute('aria-hidden', 'true');
            place(still, root.getBoundingClientRect());
            root.after(still);
            root.style.transition = 'none';
            root.style.opacity = '0';
            step.show(state);
            void view.getComputedStyle(root).opacity; // commits opacity 0 so the fade in runs
            for (const e of [root, still]) e.style.transition = `opacity ${ms}ms`;
            root.style.opacity = '';
            still.style.opacity = '0';
            const run = () => {
                pending = undefined;
                still.remove();
                root.style.transition = '';
            };
            pending = { timer: view.setTimeout(run, ms), run };
        }
        indicator.textContent = `Step ${index + 1} of ${steps.length}`;
        // A picked visual part records the step it was picked on.
        controls.dataset.step = String(index);
        previous.disabled = index === 0;
        next.disabled = index === steps.length - 1;
        // A bound disables the focused button; keep focus on the controls.
        if (
            document.activeElement instanceof view.HTMLButtonElement &&
            document.activeElement.disabled
        )
            (previous.disabled ? next : previous).focus();
    };
    // Lays e over a box on screen, inside controls; the frame may scale the body down to fit.
    const place = (e: HTMLElement, box: DOMRect) => {
        const base = controls.getBoundingClientRect(),
            scale = base.width && controls.offsetWidth ? base.width / controls.offsetWidth : 1;
        Object.assign(e.style, {
            position: 'absolute',
            left: `${(box.left - base.left) / scale}px`,
            top: `${(box.top - base.top) / scale}px`,
            width: `${box.width / scale}px`,
            height: `${box.height / scale}px`,
            margin: '0',
            boxSizing: 'border-box',
            pointerEvents: 'none',
        });
    };
    // Outlines the nearest visual part of each changed node, or the changed element when it has none.
    const pulse = (changed: Set<Node>) => {
        const shown = new Set<Element>();
        for (const node of changed) {
            const e = node instanceof view.Element ? node : node.parentElement,
                part = e?.closest('[data-part]');
            const target = part && root.contains(part) ? part : e;
            if (target && target !== root && root.contains(target)) shown.add(target);
        }
        for (const target of shown) {
            const box = target.getBoundingClientRect();
            if (!box.width || !box.height) continue;
            const ring = controls.appendChild(document.createElement('div'));
            ring.className = 'tt-pulse';
            ring.setAttribute('aria-hidden', 'true');
            place(ring, box);
            view.setTimeout(() => ring.remove(), PULSE);
        }
    };
    previous.addEventListener('click', () => stepTo(index - 1));
    next.addEventListener('click', () => stepTo(index + 1));
    play.addEventListener('click', toggle);
    const buttons = new Map<EventTarget | null, number>([
        [previous, -1],
        [next, 1],
        [play, 0],
    ]);
    controls.addEventListener('keydown', (event) => {
        const arrows: Record<string, number> = {
            ArrowLeft: -1,
            ArrowUp: -1,
            ArrowRight: 1,
            ArrowDown: 1,
        };
        const button = buttons.get(event.target);
        if (button === undefined) return; // keys inside the visual itself, such as a slider, are its own
        const activate = event.key === 'Enter' || event.key === ' ',
            move = arrows[event.key] ?? (activate ? button : 0);
        if (!move && !activate) return;
        event.preventDefault(); // stops the native click so Enter and Space act once
        if (move) stepTo(index + move);
        else if (!event.repeat) toggle();
    });
    // Space activates a button on keyup; the keydown above already stepped.
    controls.addEventListener('keyup', (event) => {
        if (event.key === ' ' && (event.target === previous || event.target === next))
            event.preventDefault();
    });
    // The host opens a branched visual part at the step it was picked on.
    controls.addEventListener('tt-show', (event) => stepTo((event as CustomEvent).detail, 0));
    // Root keeps its tallest step's height, so stepping never moves the controls or rescales the frame.
    // Steps are states by contract, so running each once at duration 0 is safe; measure again when width or fonts change.
    const measure = () => {
        root.style.minHeight = '';
        const style = view.getComputedStyle(root),
            frame = ['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth'].reduce(
                (sum, key) => sum + (parseFloat(style[key as 'paddingTop']) || 0),
                0,
            );
        let tallest = 0;
        const changes = new view.MutationObserver(() => {});
        changes.observe(root, {
            subtree: true,
            childList: true,
            attributes: true,
            characterData: true,
        });
        motion = steps.map((step, i) => {
            (typeof step === 'function' ? step : step.show)({ index: i, duration: 0 });
            tallest = Math.max(tallest, root.offsetHeight);
            // shortcut: times synchronous DOM changes only, extend if asynchronous steps need adaptive timing.
            const changed = new Set(changes.takeRecords().map((record) => record.target)).size;
            return Math.min(2500, 1500 + 100 * changed);
        });
        changes.disconnect();
        if (tallest) root.style.minHeight = `${tallest - frame}px`;
        show(index, 0);
    };
    // Play pauses when the visual scrolls out of view or the page is hidden.
    if (view.IntersectionObserver)
        new view.IntersectionObserver(([entry]) => entry.isIntersecting || pause()).observe(
            controls,
        );
    document.addEventListener('visibilitychange', () => document.hidden && pause());
    measure();
    let width = root.offsetWidth;
    view.addEventListener('resize', () => {
        if (root.offsetWidth === width) return;
        width = root.offsetWidth;
        measure();
    });
    document.fonts?.ready.then(measure);
    return { show: (target: number, animate = true) => stepTo(target, animate ? duration : 0) };
}

// SVG elements have no hidden property; reflect it to the attribute the frame's base style hides.
export function reflectSvgHidden(view: Window & typeof globalThis) {
    Object.defineProperty(view.SVGElement.prototype, 'hidden', {
        configurable: true,
        get(this: SVGElement) {
            return this.hasAttribute('hidden');
        },
        set(this: SVGElement, value: unknown) {
            this.toggleAttribute('hidden', Boolean(value));
        },
    });
}
