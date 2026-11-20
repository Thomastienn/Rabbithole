import { VERDICT_SHAPE } from '../media/reply-requests.mjs';

// record_turn: the tutor's hidden end-of-reply record (ADR 0013), replacing the verdict and notes blocks.
const LEVELS = VERDICT_SHAPE.slice(VERDICT_SHAPE.indexOf('Levels:'));
const names = { type: 'array', items: { type: 'string' } };

export const RECORD_TURN = {
    name: 'record_turn',
    description:
        'Record what this reply leaves behind. Call it exactly once per reply, after all your text; the learner never sees it, so never mention it. Every argument is optional; leave one out or empty when nothing qualifies, and never pad. ' +
        'When a concept, groundwork or topic is the same as one in the concept neighbourhood, even under another wording, use its name exactly. The result names any entry that was skipped; do not call again.',
    parameters: {
        type: 'object',
        properties: {
            next_questions: {
                ...names,
                description:
                    "Up to three deep, curious how, why or what-if questions this reply raises but does not answer, in the learner's voice; none after a casual turn.",
            },
            video_offer: {
                type: 'string',
                description:
                    'Rarely, as a last resort: one next question worded as the learner asking for a video of the idea, such as "Can you make a video of how the heap reorders itself?", when they hinted at a video or still do not follow. At most one per reply; never in a reply holding a visual, discussion or video.',
            },
            suggestions: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: { text: { type: 'string' }, concept: { type: 'string' } },
                    required: ['text'],
                },
                description:
                    "Each term or short phrase of one to six words used in this reply but not explained in it, relevant to the question and probably unfamiliar to this learner, with the concept it names. Copy text exactly as written in the reply, in reading order without overlaps. Skip terms defined in place, everyday words, the question's own topic, section headings, whole sentences and concepts the learner already knows well.",
            },
            groundwork: {
                ...names,
                description:
                    'Up to three concepts, usually none, that this reply relies on without naming and this learner probably needs first; never one named in the reply or already well known to the learner.',
            },
            concepts: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: { name: { type: 'string' }, topics: names },
                    required: ['name', 'topics'],
                },
                description:
                    'Each concept the reply teaches or relies on, with its topics: broad subject areas such as "Concurrency", few and broad, never one per concept.',
            },
            links: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        from: { type: 'string' },
                        to: { type: 'string' },
                        kind: { type: 'string', enum: ['related', 'builds on'] },
                    },
                    required: ['from', 'to', 'kind'],
                },
                description: 'Links between those concepts; "builds on" when from needs to first.',
            },
            verdicts: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        concept: { type: 'string' },
                        level: { type: 'integer', minimum: 0, maximum: 5 },
                        confidence: { type: 'string', enum: ['low', 'high'] },
                    },
                    required: ['concept', 'level', 'confidence'],
                },
                description:
                    "What the learner's latest message (including a selected passage and question about it) showed about each concept it touched, under the concept's usual short name; empty when it shows nothing. " +
                    LEVELS,
            },
        },
    },
};

const name = (v) =>
    typeof v === 'string' && v.trim() && v.trim().length <= 200 && !/[\u0000-\u001f]/.test(v)
        ? v.trim()
        : null;
const object = (v) => v && typeof v === 'object' && !Array.isArray(v);
const skip = (reason) => ({ skip: reason });
// Each reader returns the kept entry or skip(reason).
const READERS = {
    next_questions: (q) =>
        typeof q === 'string' && q.trim() ? q.trim() : skip('needs non-empty text'),
    suggestions: (s) =>
        !object(s) || typeof s.text !== 'string' || !s.text.trim()
            ? skip('needs text')
            : { text: s.text, ...(name(s.concept) && { concept: name(s.concept) }) },
    groundwork: (g) => name(g) ?? skip('needs a concept name'),
    concepts: (c) => {
        const topics = Array.isArray(c?.topics) ? c.topics.map(name).filter(Boolean) : [];
        return object(c) && name(c.name) && topics.length
            ? { name: name(c.name), topics }
            : skip('needs name and at least one topic');
    },
    links: (l) =>
        object(l) && name(l.from) && name(l.to) && ['related', 'builds on'].includes(l.kind)
            ? { from: name(l.from), to: name(l.to), kind: l.kind }
            : skip('needs from, to and kind "related" or "builds on"'),
    verdicts: (v) =>
        object(v) &&
        name(v.concept) &&
        Number.isInteger(v.level) &&
        v.level >= 0 &&
        v.level <= 5 &&
        ['low', 'high'].includes(v.confidence)
            ? { concept: name(v.concept), level: v.level, confidence: v.confidence }
            : skip('needs concept, level 0-5 and confidence "low" or "high"'),
};

// Tolerant like the blocks were: invalid entries are skipped and named; the valid ones are kept.
// A repeat call adds to the earlier one's entries.
// hasMedia: the reply already holds a visual, discussion or video, so no video offer joins it.
export function readRecordTurn(input, earlier = null, hasMedia = false) {
    const kept = {},
        skipped = [];
    for (const [key, read] of Object.entries(READERS)) {
        kept[key] = [...(earlier?.kept[key] ?? [])];
        const list = input?.[key];
        if (list === undefined) continue;
        if (!Array.isArray(list)) {
            skipped.push(`${key} (must be a list)`);
            continue;
        }
        list.forEach((entry, i) => {
            const value = read(entry);
            if (value?.skip) skipped.push(`${key}[${i}] (${value.skip})`);
            else if (key === 'next_questions' && kept[key].length >= 3)
                skipped.push(`${key}[${i}] (at most three)`);
            else kept[key].push(value);
        });
    }
    // The video offer is a next question; choosing it sends it as the learner's ask.
    const offer = input?.video_offer;
    let offered = earlier?.offered ?? false;
    if (offer !== undefined) {
        const reason =
            typeof offer !== 'string' || !offer.trim()
                ? 'needs non-empty text'
                : offered
                  ? 'at most one per reply'
                  : hasMedia
                    ? 'never in a reply holding a visual, discussion or video'
                    : kept.next_questions.length >= 3
                      ? 'at most three next questions'
                      : null;
        if (reason) skipped.push(`video_offer (${reason})`);
        else {
            kept.next_questions.push(offer.trim());
            offered = true;
        }
    }
    // The last verdict for a concept wins, as in the block.
    const verdicts = new Map(kept.verdicts.map((v) => [v.concept.toLowerCase(), v]));
    return {
        kept,
        offered,
        notes: {
            questions: kept.next_questions,
            suggestions: kept.suggestions,
            groundwork: kept.groundwork,
            concepts: kept.concepts,
            links: kept.links,
            readable: true,
        },
        verdicts: [...verdicts.values()],
        result: skipped.length ? `recorded; skipped ${skipped.join(', ')}` : 'recorded',
    };
}
