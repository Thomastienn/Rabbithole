import { ENGINES } from './cut-engines.mjs';

// The states a cut can be in, the job phase each one reports and the states it can move to.
// Writing and narration run side by side, so a cut leaves writing for narrating or auditing.
// An audit with issues fixes the cut; a crash, a failed fix or a failed Manim render repairs it.
// A cut kept from a failed attempt starts ready and may still move back to repairing.
// A failed cut stops the video; it reports no phase.
export const CUT_STATES = {
    writing: { phase: 'writing', next: ['narrating', 'auditing', 'failed'] },
    narrating: { phase: 'narrating', next: ['auditing', 'failed'] },
    auditing: { phase: 'auditing', next: ['fixing', 'repairing', 'ready', 'failed'] },
    fixing: { phase: 'auditing', next: ['repairing', 'ready', 'failed'] },
    repairing: { phase: 'auditing', next: ['auditing', 'ready', 'failed'] },
    ready: { phase: 'playable', next: ['repairing'] },
    failed: { next: [] },
};

// A video job's phases in order; they only move forward, while a cut's state may move back.
export const PHASES = [
    'planning',
    'pieces',
    'writing',
    'narrating',
    'auditing',
    'playable',
    'saving',
];

// Worked out from the saved cut fields, so videos saved before this definition still load.
// Ready: code, measured narration, a settled audit and what its engine plays (a Manim cut's clip).
export const cutState = (cut) =>
    cut.status === 'failed'
        ? 'failed'
        : (cut.step ??
          (!cut.code
              ? 'writing'
              : !cut.timing
                ? 'narrating'
                : !cut.audited || !ENGINES[cut.engine].playable(cut)
                  ? 'auditing'
                  : 'ready'));

export const playable = (cut) => cutState(cut) === 'ready';
