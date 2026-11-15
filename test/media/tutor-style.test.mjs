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
