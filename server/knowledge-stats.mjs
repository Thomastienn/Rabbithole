// The Knowledge page's stats figures from stored rows. Pure; the store gathers the rows.
import { familiarity, KNOWN } from './familiarity.mjs';

const WEEK = 7 * 24 * 60 * 60 * 1000;
// Rounded like the graph's familiarity, so "known" matches a full ring exactly.
const known = (observations, at) => Math.round(familiarity(observations, at) * 100) / 100 >= KNOWN;
// A misconception clears when a later message explains the idea (level 3, "Explains it") or better.
const CLEARS = 3;

// concepts: graph concepts; observations: [{ concept, level, confidence, at, text, place? }], place being the
// message's conversation { root, address, ink };
// firstEvidence: Map name -> earliest evidence time; activity: [{ day, messages }].
export function knowledgeStats({ concepts, observations, firstEvidence, activity }, now) {
    const observed = Map.groupBy(
        observations.toSorted((a, b) => a.at - b.at),
        (o) => o.concept,
    );
    const seen = (name) =>
        Math.min(firstEvidence.get(name) ?? Infinity, observed.get(name)?.[0].at ?? Infinity);
    const since = Math.min(...concepts.map((c) => seen(c.name)));
    // Weekly points ending now; a concept with no recorded time counts as met from the start.
    const growth = [];
    if (Number.isFinite(since))
        for (let k = Math.floor((now - since) / WEEK); k >= 0; k--) {
            const at = now - k * WEEK;
            growth.push({
                at,
                met: concepts.filter((c) => seen(c.name) <= at || seen(c.name) === Infinity).length,
                known: concepts.filter((c) =>
                    known(
                        (observed.get(c.name) ?? []).filter((o) => o.at <= at),
                        at,
                    ),
                ).length,
            });
        }
    const topics = [
        ...Map.groupBy(
            concepts.flatMap((c) => c.topics.map((t) => [t, c.familiarity])),
            ([t]) => t,
        ),
    ]
        .map(([name, rows]) => ({
            name,
            familiarity:
                Math.round((rows.reduce((s, [, f]) => s + f, 0) / rows.length) * 100) / 100,
            concepts: rows.length,
        }))
        .sort((a, b) => b.familiarity - a.familiarity || a.name.localeCompare(b.name));
    const fading = concepts
        .filter((c) => !known(observed.get(c.name) ?? [], now))
        .flatMap((c) => {
            const list = observed.get(c.name) ?? [];
            const i = list.findLastIndex((o, j) => known(list.slice(0, j + 1), o.at));
            if (i < 0) return [];
            // Known until the fade crosses below known, or the next message pulls it below.
            const prefix = list.slice(0, i + 1);
            let lo = list[i].at,
                hi = list[i + 1]?.at ?? now;
            if (!known(prefix, hi))
                while (hi - lo > 60_000) {
                    const mid = (lo + hi) / 2;
                    if (known(prefix, mid)) lo = mid;
                    else hi = mid;
                }
            return [{ name: c.name, until: Math.round(hi) }];
        })
        .sort((a, b) => a.until - b.until);
    const misconceptions = observations
        .filter((o) => o.level === 0)
        .map((o) => ({
            name: o.concept,
            at: o.at,
            text: o.text ?? '',
            place: o.place ?? null,
            cleared:
                observed.get(o.concept).find((later) => later.at > o.at && later.level >= CLEARS)
                    ?.at ?? null,
        }))
        .sort((a, b) => b.at - a.at);
    return {
        since: Number.isFinite(since) ? since : null,
        growth,
        topics,
        fading,
        misconceptions,
        activity,
    };
}
