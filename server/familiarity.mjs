// Familiarity from a concept's observations: a fading running average. Pure; the store calls it.
const DAY = 24 * 60 * 60 * 1000;
// Where an unobserved concept starts, and how many low-confidence observations that start is worth.
export const PRIOR = 0.3;
const PRIOR_WEIGHT = 1;
// How much one observation counts: a high-confidence verdict moves the estimate further.
const WEIGHT = { low: 1, high: 2 };
// Cap on gathered weight, so even a well-known concept still moves when the learner shows a misconception.
const MAX_WEIGHT = 6;
// What fading drifts toward: a concept once seen is rarely fully forgotten.
export const FLOOR = 0.2;
// Time for the distance to FLOOR to shrink by a factor of e, before any spaced evidence.
export const START_STABILITY = 2 * DAY;
// Spaced evidence (level 2 or above, at least GAP after the previous observation) multiplies stability by GROWTH.
export const GAP = DAY;
const GROWTH = 3;

const fade = (estimate, elapsed, stability) =>
    FLOOR + (estimate - FLOOR) * Math.exp(-Math.max(0, elapsed) / stability);

// observations: [{ level 0-5, confidence 'low'|'high', at ms }] in any order.
export function familiarity(observations, now) {
    let estimate = PRIOR,
        weight = PRIOR_WEIGHT,
        stability = START_STABILITY,
        last = null;
    for (const o of [...observations].sort((a, b) => a.at - b.at)) {
        if (last !== null) estimate = fade(estimate, o.at - last, stability);
        const w = WEIGHT[o.confidence] ?? WEIGHT.low;
        estimate += (w / (weight + w)) * (o.level / 5 - estimate);
        weight = Math.min(MAX_WEIGHT, weight + w);
        if (o.level === 0) stability = START_STABILITY;
        else if (o.level >= 2 && last !== null && o.at - last >= GAP) stability *= GROWTH;
        last = o.at;
    }
    return last === null ? estimate : fade(estimate, now - last, stability);
}
