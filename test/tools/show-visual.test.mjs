import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readShowVisual,
  SHOW_VISUAL,
  visualPosition,
  visualSide,
} from '../../server/tools/showVisual.mjs';
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

test('a visual lands after its anchor in its own response, else at the call', () => {
  const earlier = 'Before. ';
  const text = earlier + 'Halve the list. Then search one half. Done.';
  const at = (after, start = earlier.length) => visualPosition({ after }, text, start, text.length);
  assert.equal(at('Halve the list.'), text.indexOf(' Then'));
  assert.equal(at('halve   THE\nlist.'), text.indexOf(' Then'));
  assert.equal(at('one half.'), text.indexOf(' Done'));
  // A misquote, or a passage from an earlier response, falls back to the call.
  assert.equal(at('Halve the array.'), text.length);
  assert.equal(at('Before.'), text.length);
  // Quoting the text just before the call keeps the call's place even when it also appears earlier.
  assert.equal(visualPosition({ after: 'Go.' }, 'Go. Go.', 0, 7), 7);
  assert.throws(() => at(''), /show_visual needs after/);
  assert.throws(() => at('x'.repeat(121)), /after is 121 characters/);
  assert.equal(visualPosition({}, text, 0, 3, false), 3);
});

test('show_visual side is left, right or left out', () => {
  assert.equal(visualSide({ ...call, side: 'right' }), 'right');
  assert.equal(visualSide({ ...call, side: 'left' }), 'left');
  assert.equal(visualSide(call), null);
  assert.throws(() => visualSide({ ...call, side: 'top' }), /side must be left or right/);
  assert.deepEqual(SHOW_VISUAL.parameters.properties.side.enum, ['left', 'right']);
  assert.ok(!SHOW_VISUAL.parameters.required.includes('side'));
});

test('the tutor prompt keeps visuals out of :::figure', () => {
  const prompt = tutorSystem({ tools: [SHOW_VISUAL] });
  assert.match(prompt, /To show an image beside its explanation/);
  assert.doesNotMatch(
    prompt,
    /image or visual beside|or rabbithole-visual block and the explanation/,
  );
  assert.doesNotMatch(SHOW_VISUAL.description, /Inside a :::figure/);
  assert.ok(SHOW_VISUAL.parameters.required.includes('after'));
});

test('with show_visual offered, the tutor prompt holds no visual block rules', () => {
  assert.doesNotMatch(TOOL_VISUAL_RULES, /rabbithole-visual/);
  assert.doesNotMatch(TOOL_VISUAL_RULES, /rabbithole-video/);
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
