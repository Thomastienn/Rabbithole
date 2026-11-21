import test from 'node:test';
import assert from 'node:assert/strict';
import { readVisualMarker, stripMarkers } from '../../server/media/markers.mjs';
import { TOOL_VISUAL_RULES, tutorSystem } from '../../server/media/diagrams.mjs';
import { APP_TOOLS, appCalls } from '../../server/http/app-calls.mjs';
import { roundText } from '../../server/providers/chatStream.mjs';

test('a visual marker reads its fields, cutting long ones and filling a missing title or alt', () => {
    assert.deepEqual(
        readVisualMarker(
            ' rounds | title: Rounds | shows: Two winners meet | alt: Two arrows join. | check: B wins: 3 > 2 | extra: x',
            '  Intro.  ',
        ),
        {
            title: 'Rounds',
            shows: 'Two winners meet',
            alt: 'Two arrows join.',
            check_answer: 'B wins: 3 > 2',
            context: 'Intro.',
        },
    );
    assert.deepEqual(readVisualMarker('rounds | SHOWS: Two winners'), {
        title: 'rounds',
        shows: 'Two winners',
        alt: 'Two winners',
    });
    const long = readVisualMarker(
        `${'n'.repeat(50)} | shows: ${'s'.repeat(300)} | check: ${'c'.repeat(700)} | alt: a\tb\u0007`,
    );
    assert.equal(long.title, 'n'.repeat(40));
    assert.equal(long.shows, 's'.repeat(280));
    assert.equal(long.check_answer, 'c'.repeat(600));
    assert.equal(long.alt, 'ab');
    assert.equal(readVisualMarker(' | shows: Only shows').title, 'Only shows');
    assert.deepEqual(readVisualMarker('rounds | title: T | shows:  '), { cause: 'no shows' });
});

test('a visual marker that turns into code does not hide a later one', () => {
    const drawn = [];
    const calls = appCalls(
        { log: () => {} },
        { showVisual: (request) => drawn.push(request.shows) },
    );
    const start = 'Look `[[visual: a | shows: b]]';
    calls.place(stripMarkers(start));
    calls.place(stripMarkers(start + '` then\n[[visual: c | shows: d]]'));
    assert.deepEqual(drawn, ['b', 'd']);
});

test('the tutor prompt describes the visual marker and no show_visual tool or queued result', () => {
    assert.doesNotMatch(TOOL_VISUAL_RULES, /rabbithole-visual|rabbithole-video/);
    for (const prompt of [
        tutorSystem({ tools: APP_TOOLS }),
        tutorSystem({ textTools: APP_TOOLS }),
    ]) {
        assert.match(
            prompt,
            /\[\[visual: name \| title: .* \| shows: .* \| alt: .* \| check: .*\]\]/,
        );
        assert.match(prompt, /keep \[, \], \| and line breaks out of its fields/);
        assert.match(prompt, /write math in words inside it/);
        assert.doesNotMatch(prompt, /show_visual|queued|rabbithole-visual/);
    }
    assert.ok(!APP_TOOLS.some((t) => t.name === 'show_visual'));
    assert.match(tutorSystem({}), /rabbithole-visual block/);
});

test('a continuation that repeats shown text drops the repeated prefix', () => {
    const run = (rounds) => {
        let out = '';
        const reply = roundText((text) => (out += text));
        for (const parts of rounds) {
            reply.start();
            for (const part of parts) reply.write(part);
            reply.end();
        }
        return out;
    };
    assert.equal(run([['Intro.'], ['Intro', '.', ' More.']]), 'Intro.\n\nMore.');
    assert.equal(run([['A. '], ['B.'], ['A. B. ', 'C.']]), 'A. \n\nB.\n\nC.');
    assert.equal(run([['A. '], ['B.'], ['B. C.']]), 'A. \n\nB.\n\nC.');
    // Not a repeat: shown as written, including a partial repeat that ends.
    assert.equal(run([['Intro.'], ['In', 'deed.']]), 'Intro.\n\nIndeed.');
    assert.equal(run([['Intro.'], ['Int']]), 'Intro.\n\nInt');
    assert.equal(run([[], ['First.']]), 'First.');
});
