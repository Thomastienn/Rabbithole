import test from 'node:test';
import assert from 'node:assert/strict';
import { fuzzyScore, searchGroups, searchModels } from '../../src/settings/models.ts';

const item = (value, label = value) => ({ value, label });

test('fuzzy search finds a subsequence and ranks contiguous, then early matches first', () => {
  const items = ['claude-opus-4-6', 'claude-sonnet-4-6', 'sonar-pro', 'claude-sonnet-4-5'].map(
    (v) => item(v),
  );
  assert.deepEqual(
    searchModels(items, 'son46').shown.map((i) => i.value),
    ['claude-sonnet-4-6'],
  );
  assert.deepEqual(
    searchModels(items, 'son').shown.map((i) => i.value),
    ['sonar-pro', 'claude-sonnet-4-6', 'claude-sonnet-4-5'],
  );
  assert.equal(fuzzyScore('xyz', 'claude'), null);
  assert.ok(fuzzyScore('opus', 'claude-opus') < fuzzyScore('opus', 'o-p-u-s'));
  // Label or id may match; case and spaces in the query are ignored.
  assert.deepEqual(
    searchModels([item('x-1', 'Sonnet 4.6')], 'SON 46').shown.map((i) => i.value),
    ['x-1'],
  );
});

test('thousands of models: at most 50 are shown and a keystroke stays well under a frame', () => {
  const items = Array.from({ length: 5000 }, (_, i) => item(`vendor/model-${i}-instruct`));
  assert.equal(searchModels(items, '').shown.length, 50);
  assert.equal(searchModels(items, '').found, 5000);
  const started = performance.now();
  const { shown, found } = searchModels(items, 'mod12');
  assert.ok(performance.now() - started < 50, 'search stays fast without a debounce');
  assert.equal(shown.length, 50);
  assert.ok(found > 50);
  assert.equal(shown[0].value, 'vendor/model-12-instruct');
});

test('grouped search keeps each group’s shown items in rank order', () => {
  const a = [item('gpt-4o'), item('gpt-4o-mini')],
    b = [item('o4-mini'), item('mini')];
  const { groups, found } = searchGroups([a, b], 'mini');
  assert.equal(found, 3);
  assert.deepEqual(
    groups.map((g) => g.map((i) => i.value)),
    [['gpt-4o-mini'], ['mini', 'o4-mini']],
  );
});
