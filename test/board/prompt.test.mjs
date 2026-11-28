import test from 'node:test';
import assert from 'node:assert/strict';
import { boardSystem } from '../../server/board/prompt.mjs';
import { DEFAULT_TUTOR_STYLE, tutorTuning } from '../../server/media/tutor-instructions.mjs';
import { TEACHING_SKILL, HUMANIZER_SKILL, ADHD_SKILL } from '../../server/media/skills.mjs';

test('board prompt: chat teaching skills and tutor style first, then voice mode, which keeps the script format', () => {
    const prompt = boardSystem({ tutorStyle: ' Mine. ' });
    assert.ok(prompt.startsWith(tutorTuning('Mine.').trimStart()), 'the same text chat gets');
    const at = [
        TEACHING_SKILL,
        HUMANIZER_SKILL,
        ADHD_SKILL,
        'Mine.',
        'VOICE MODE',
        'FORMAT (strict)',
        'EXAMPLE',
    ].map((part) => prompt.indexOf(part));
    assert.ok(
        at.every((position, index) => position > (at[index - 1] ?? -1)),
        `${at}`,
    );
    // Voice mode overrides chat's writing for reading.
    assert.match(prompt, /this section wins wherever the two differ/);
    assert.match(prompt, /plain everyday words/);
    assert.match(prompt, /The first time you use a term, say what it means in plain words\./);
    assert.match(
        prompt,
        /no Markdown, headings, lists, numbered steps, tables, code, links, citations or LaTeX/,
    );
    // The script format the board parser reads.
    for (const line of [
        '- A spoken line starts with "> ", a question "?> " and a check-in "~> ".',
        '- The sentence that carries a part\'s key idea starts with "!> " instead of "> "',
        '- Every other line is one board op: <id> <kind> <arguments> [key=value]. Ops belong to the sentence above them.',
        'write the op line "pause S" after a sentence\'s ops',
        'PACE: you are speaking live.',
    ])
        assert.ok(prompt.includes(line), line);
    // None of chat's media rules.
    for (const rule of [
        'rabbithole-visual',
        '[[visual:',
        '```sketch',
        ':::figure',
        'Visual frequency',
    ])
        assert.ok(!prompt.includes(rule), rule);
});

test("board prompt: an unset tutor style gets chat's default style, as chat does", () => {
    for (const tutorStyle of [undefined, null, '  '])
        assert.ok(boardSystem({ tutorStyle }).includes(DEFAULT_TUTOR_STYLE + '\n\nVOICE MODE'));
});
