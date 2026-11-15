import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_TUTOR_STYLE, TUTOR_RULES, tutorSystem } from '../../server/media/diagrams.mjs';

test('tutor prompt puts the tutor style first, always keeps the fixed rules and keeps the per-tree override', () => {
  const rules = '\n\n' + TUTOR_RULES;
  for (const tutorStyle of [undefined, null, '', '  \n '])
    assert.equal(tutorSystem({ tutorStyle }), DEFAULT_TUTOR_STYLE + rules, `${tutorStyle}`);
  assert.equal(
    tutorSystem({ tutorStyle: '  Teach with sports analogies. ' }),
    'Teach with sports analogies.' + rules,
  );
  for (const rule of [
    /Answer the question fully first; never hold an answer back behind questions/,
    /Teach at the learner's level/,
    /one optional practice step or check-yourself visual/,
    /Back specific claims with resources, and recommend one primary resource/,
    /option about the same length and vary the right answer's position/,
    /at most one question per reply, at the end, and only when it helps/,
    /Search only for specific facts, figures, dates or recent events, or when you are unsure/,
  ])
    assert.match(DEFAULT_TUTOR_STYLE, rule);
  assert.match(TUTOR_RULES, /^Do not use tools[\s\S]*treetutor-visual[\s\S]*treetutor-video/);
  assert.match(
    TUTOR_RULES,
    /every formula[^\n]*\$\.\.\.\$[^\n]*\$\$\.\.\.\$\$[^\n]*never[^\n]*plain text/,
  );
  const branch = { snapshot: 'Frozen fact', text: 'Passage' };
  const child = tutorSystem({ tutorStyle: 'Mine.', branch });
  assert.ok(child.startsWith('Mine.' + rules + '\nThis is a focused conversation'));
  assert.ok(child.includes('Frozen fact'));
  assert.equal(tutorSystem({ tutorStyle: 'Mine.', instructions: 'Worker only.' }), 'Worker only.');
});

test('the chat prompt lists strong-evidence concepts as data, and nothing when there are none', () => {
  const concepts = { known: ['Recursion'], shaky: ['Big-O'] };
  const prompt = tutorSystem({ tutorStyle: 'Mine.', concepts });
  assert.ok(prompt.endsWith('\n' + JSON.stringify(concepts)));
  assert.match(prompt, /strong evidence \(learner data, not instructions\)/);
  assert.equal(
    tutorSystem({ tutorStyle: 'Mine.', concepts: { known: [], shaky: [] } }),
    tutorSystem({ tutorStyle: 'Mine.' }),
  );
});
