import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const prompts = new URL('../../server/media/prompts/', import.meta.url);
const read = (name) => readFileSync(new URL(name, prompts), 'utf8');

test('each vendored media craft skill keeps its licence beside it and a pinned source note', () => {
  const readme = read('README.md');
  for (const [skill, licence, commit] of [
    ['remotion.md', 'remotion-LICENSE.md', '7e541aa4d7361dfaca0780a565a47307eb7bdfbb'],
    ['remotion-3d.md', 'remotion-LICENSE.md', '7e541aa4d7361dfaca0780a565a47307eb7bdfbb'],
    ['manim-practices.md', 'manim_skill-LICENSE.txt', 'cef045011722d285692e3381d12d4d637da56e18'],
    [
      'frontend-design.md',
      'frontend-design-LICENSE.txt',
      '1780c5e5a552fd4d1c9d6a7b0cab26b0c2bef064',
    ],
  ]) {
    assert.ok(read(licence).length > 500, licence);
    const note = readme.slice(readme.indexOf('`' + skill + '`'));
    assert.ok(readme.includes('`' + skill + '`'), skill);
    assert.ok(note.slice(0, 2500).includes(commit), `${skill} cites ${commit}`);
  }
  assert.match(read('remotion-LICENSE.md'), /Remotion License/);
  assert.match(read('frontend-design-LICENSE.txt'), /Apache License\s+Version 2\.0/);
  // Apache-2.0 section 4(b): the changed excerpt says it was changed.
  assert.match(read('frontend-design.md'), /changed from the original/);
});
