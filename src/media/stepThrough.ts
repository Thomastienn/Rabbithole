// Shared step-through helper the visual frame installs before any fragment runs.
// A fragment calls stepThrough(root, steps); each step moves the visual to that state.
type Step = (state: { index: number; duration: number }) => void;

export function stepThrough(root: HTMLElement, steps: Step[], duration = 300) {
  const document = root.ownerDocument,
    view = document.defaultView!,
    controls = document.createElement('div'),
    previous = document.createElement('button'),
    next = document.createElement('button'),
    indicator = document.createElement('span');
  let index = 0;
  controls.className = 'tt-steps';
  controls.setAttribute('role', 'group');
  controls.setAttribute('aria-label', 'Steps');
  for (const [button, label] of [
    [previous, 'Previous'],
    [next, 'Next'],
  ] as const) {
    button.type = 'button';
    button.textContent = label;
  }
  indicator.setAttribute('aria-live', 'polite');
  controls.append(previous, indicator, next);
  root.after(controls);

  const show = (target: number, animate = true) => {
    index = Math.max(0, Math.min(steps.length - 1, target));
    const ms =
      animate && !view.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? duration : 0;
    root.style.setProperty('--step-duration', `${ms}ms`);
    steps[index]({ index, duration: ms });
    indicator.textContent = `Step ${index + 1} of ${steps.length}`;
    previous.disabled = index === 0;
    next.disabled = index === steps.length - 1;
    // A bound disables the focused button; keep focus on the controls.
    if (document.activeElement instanceof view.HTMLButtonElement && document.activeElement.disabled)
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
