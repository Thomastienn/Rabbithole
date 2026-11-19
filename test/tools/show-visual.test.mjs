import test from 'node:test';
import assert from 'node:assert/strict';
import { readShowVisual, SHOW_VISUAL } from '../../server/tools/showVisual.mjs';
import { TOOL_VISUAL_RULES, tutorSystem } from '../../server/media/diagrams.mjs';
import { roundText } from '../../server/providers/chatStream.mjs';

const call = { title: 'Rounds', shows: 'Two winners meet in the final', alt: 'Two arrows join.' };

test('show_visual names a missing or over-long argument, and a corrected call reads', () => {
  assert.throws(() => readShowVisual({ ...call, shows: undefined }), /show_visual needs shows/);
  assert.throws(() => readShowVisual({ ...call, alt: '  ' }), /needs alt/);
  assert.throws(
    () => readShowVisual({ ...call, title: 'x'.repeat(121) }),
    /title is 121 characters; shorten it to at most 120/,
  );
  assert.throws(() => readShowVisual({ ...call, check_answer: 4 }), /needs check_answer/);
  assert.deepEqual(readShowVisual({ ...call, extra: 1 }, '  Intro.  '), {
    ...call,
    context: 'Intro.',
  });
  assert.equal(
    readShowVisual({ ...call, check_answer: 'Right half, because 12 > 8.' }).check_answer,
    'Right half, because 12 > 8.',
  );
});

test('with show_visual offered, the tutor prompt holds no visual block rules', () => {
  assert.doesNotMatch(TOOL_VISUAL_RULES, /rabbithole-visual/);
  assert.match(TOOL_VISUAL_RULES, /rabbithole-video block containing a JSON object with title/);
  const prompt = tutorSystem({ tools: [SHOW_VISUAL] });
  assert.doesNotMatch(prompt, /rabbithole-visual/);
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
