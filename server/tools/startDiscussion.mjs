import { readDiscussion } from '../media/discussions.mjs';

// start_discussion: an app tool the server runs itself; the opening is validated like the block was.
export const START_DISCUSSION = {
    name: 'start_discussion',
    description:
        'Start a discussion with classmates, only when the learner asks for a discussion; never start one unasked or treat an ordinary question as a request. Call it last in your reply, with no text after it, since its lines appear one at a time. ' +
        "Choose 3 or 4 classmates with distinct short names, never Tutor or Learner. Each hidden level is relative to the learner's familiarity with the discussion's concepts: below, near or above, with at least one below and one above. Use the available familiarity context and what the learner has shown about these concepts; when unknown, assume an ordinary starting explanation and spread the classmates around it. " +
        'Give each classmate a private voice beside their level: one or two sentences on how they talk and how they think, fitting their level and distinct from the others. Keep levels and voices private; never mention or label them in the lines or your text. ' +
        "Classmates write like casual online chat in the learner's language: everyday words and slang, contractions, the odd swear word or typo, short lines, rarely an emoji, no buzzwords or performed eagerness. The natural-writing guidance still applies to their lines but never flattens these voices into the tutor's register. Classmates have honest misunderstandings, ask each other questions and draw the learner in; only relevant classmates speak. The Tutor steps in only to untangle or confirm, in plain clear lines. " +
        "Write 4 to 8 short lines and end with a question to the learner. Never write learner lines or invent the learner's answer. Classmates belong only to this discussion and keep their levels and voices.",
    parameters: {
        type: 'object',
        properties: {
            classmates: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        name: {
                            type: 'string',
                            description: 'Short distinct name, at most 60 characters.',
                        },
                        level: { type: 'string', enum: ['below', 'near', 'above'] },
                        voice: {
                            type: 'string',
                            description: 'How they talk and think, at most 500 characters.',
                        },
                    },
                    required: ['name', 'level', 'voice'],
                },
                description: '3 or 4 classmates.',
            },
            lines: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        speaker: {
                            type: 'string',
                            description: 'An exact classmate name or Tutor.',
                        },
                        text: {
                            type: 'string',
                            description: 'Plain text, at most 2000 characters.',
                        },
                    },
                    required: ['speaker', 'text'],
                },
                description: '4 to 8 opening lines, the last a question to the learner.',
            },
        },
        required: ['classmates', 'lines'],
    },
};

export function readStartDiscussion(input) {
    const { task, error } = readDiscussion(input);
    if (error) throw new Error(`start_discussion: ${error}.`);
    return task;
}
