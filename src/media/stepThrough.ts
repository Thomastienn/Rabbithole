// Shared step-through helper the visual frame installs before any fragment runs.
// A fragment calls stepThrough(root, steps); each step moves the visual to that state.
// A plain function continues the scene; { scene: true, show } fades root out, shows, fades in.
// Previous and Next sit beside root, not below it, so a step that resizes root does not push them away.
type Show = (state: { index: number; duration: number }) => void;
type Step = Show | { scene: true; show: Show };

export function stepThrough(root: HTMLElement, steps: Step[], duration = 300) {
    const document = root.ownerDocument,
        view = document.defaultView!,
        controls = document.createElement('div'),
        previous = document.createElement('button'),
        next = document.createElement('button'),
        indicator = document.createElement('span');
    let index = 0,
        pending: { timer: number; run: () => void } | undefined;
    controls.className = 'tt-steps';
    controls.setAttribute('role', 'group');
    controls.setAttribute('aria-label', 'Steps');
    for (const [button, label, path] of [
        [previous, 'Previous', 'M10 3 5 8l5 5'],
        [next, 'Next', 'm6 3 5 5-5 5'],
    ] as const) {
        button.type = 'button';
        button.setAttribute('aria-label', label);
        button.title = label;
        button.innerHTML = `<svg viewBox="0 0 16 16" width="20" height="20" aria-hidden="true"><path d="${path}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    }
    indicator.setAttribute('aria-live', 'polite');
    root.replaceWith(controls);
    controls.append(previous, root, next, indicator);

    const show = (target: number, animate = true) => {
        index = Math.max(0, Math.min(steps.length - 1, target));
        const ms =
            animate && !view.matchMedia?.('(prefers-reduced-motion: reduce)').matches
                ? duration
                : 0;
        root.style.setProperty('--step-duration', `${ms}ms`);
        // A step during a fade first finishes the pending scene so later steps start from it.
        if (pending) {
            view.clearTimeout(pending.timer);
            pending.run();
        }
        const step = steps[index],
            state = { index, duration: ms };
        if (typeof step === 'function') step(state);
        else if (!ms) step.show(state);
        else {
            root.style.transition = `opacity ${ms / 2}ms`;
            root.style.opacity = '0';
            const run = () => {
                pending = undefined;
                step.show(state);
                root.style.opacity = '';
            };
            pending = { timer: view.setTimeout(run, ms / 2), run };
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
    previous.addEventListener('click', () => show(index - 1));
    next.addEventListener('click', () => show(index + 1));
    controls.addEventListener('keydown', (event) => {
        const arrows: Record<string, number> = {
            ArrowLeft: -1,
            ArrowUp: -1,
            ArrowRight: 1,
            ArrowDown: 1,
        };
        const button = event.target === previous ? -1 : event.target === next ? 1 : 0;
        if (!button) return; // keys inside the visual itself, such as a slider, are its own
        const step = arrows[event.key] ?? (event.key === 'Enter' || event.key === ' ' ? button : 0);
        if (!step) return;
        event.preventDefault(); // stops the native click so Enter and Space step once
        show(index + step);
    });
    // Space activates a button on keyup; the keydown above already stepped.
    controls.addEventListener('keyup', (event) => event.key === ' ' && event.preventDefault());
    show(0, false);
    return { show };
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
