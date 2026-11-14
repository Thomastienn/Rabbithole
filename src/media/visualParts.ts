// Tagged-part logic for the visual frame (sandbox.ts), kept free of the frame's libraries so it can be unit tested.
import { visualMessage, type VisualPart } from './artifacts';

const partOf = (element: Element) => {
  const part = visualMessage({
    type: 'branch',
    label: element.getAttribute('data-visual-label'),
    explanation: element.getAttribute('data-visual-explanation'),
  });
  return part?.type === 'branch' ? part : undefined;
};
const same = (a: VisualPart, b?: VisualPart) =>
  a.label === b?.label && a.explanation === b.explanation;

// Labels every valid part as a keyboard button; returns whether the reveal is still waiting for its part.
export function tagParts(
  root: Element,
  explored: VisualPart[],
  reveal: VisualPart | undefined,
  revealPending: boolean,
) {
  for (const element of root.querySelectorAll('[data-visual-label][data-visual-explanation]')) {
    const part = partOf(element);
    if (!part || element.matches('input, select, textarea, [contenteditable]')) continue;
    element.setAttribute('tabindex', '0');
    if (!element.matches('button')) element.setAttribute('role', 'button');
    const visited = explored.some((p) => same(part, p));
    element.toggleAttribute('data-visual-explored', visited);
    element.toggleAttribute('data-visual-reveal', same(part, reveal));
    element.setAttribute(
      'aria-label',
      `${visited ? 'Open explored branch' : 'Ask about'}: ${part.label}`,
    );
    element.setAttribute('aria-description', part.explanation);
    if (revealPending && same(part, reveal)) {
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        if (parent instanceof HTMLDetailsElement) parent.open = true;
      }
      (element as HTMLElement).scrollIntoView({ block: 'center' });
      (element as HTMLElement).focus();
      revealPending = false;
    }
  }
  return revealPending;
}

// The part a click or Enter/Space activates, or undefined when the event belongs to something else.
export function activatedPart(root: Element, event: MouseEvent | KeyboardEvent) {
  const target = event.target instanceof Element ? event.target : null;
  const element = target?.closest('[data-visual-label][data-visual-explanation]');
  if (
    !element ||
    !root.contains(element) ||
    element.matches('input, select, textarea, [contenteditable], :disabled, [aria-disabled=true]')
  )
    return;
  const control = target?.closest('button, input, select, textarea, a, [contenteditable]');
  if (control && control !== element) return;
  if (
    event instanceof KeyboardEvent &&
    (event.repeat || element.matches('button') || !['Enter', ' '].includes(event.key))
  )
    return;
  return partOf(element);
}
