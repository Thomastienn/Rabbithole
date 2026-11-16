import test from 'node:test';
import assert from 'node:assert/strict';
import { passageAnchor, branchRequest, prepareBranch } from '../../src/chat/branch.ts';

test('passage anchors keep exact UTF-16 offsets, including repeated emoji and raw Markdown', () => {
  const message = { id: 'reply', text: 'repeat 😀 repeat 😀 **bold**' };
  assert.deepEqual(passageAnchor(message, 10, 19), {
    messageId: 'reply',
    start: 10,
    end: 19,
    text: 'repeat 😀',
  });
  assert.deepEqual(passageAnchor(message, 20, 28), {
    messageId: 'reply',
    start: 20,
    end: 28,
    text: '**bold**',
  });
  assert.equal(passageAnchor(message, 10, 10), undefined);
  assert.equal(passageAnchor(message, 19, 10), undefined);
});

test('branch and preparation bodies omit popup coordinates, retain exact passage and suggestion/visual identity', () => {
  const manual = { messageId: 'm', start: 10, end: 19, text: 'repeat 😀' };
  for (const source of [
    manual,
    { ...manual, suggestion: true },
    {
      messageId: 'm',
      artifactId: 'visual',
      label: 'A leaf',
      explanation: 'One step',
      text: 'Leaf: One step',
    },
  ]) {
    const anchor = { ...source, at: { x: 3, y: 40, below: 55 } };
    assert.deepEqual(branchRequest(anchor), source);
    assert.deepEqual(branchRequest(anchor, ' Why this? '), { ...source, question: ' Why this? ' });
    assert.deepEqual(branchRequest(anchor, ''), { ...source, question: '' });
    assert.deepEqual(
      anchor.at,
      { x: 3, y: 40, below: 55 },
      'request creation leaves UI state alone',
    );
  }
});

test('form preparation and cancellation use the same passage without a question and defer errors to submit', async () => {
  const calls = [],
    anchor = branchRequest({ messageId: 'm', start: 0, end: 5, text: 'Roots', at: { x: 1, y: 2 } });
  const cancel = prepareBranch('parent', anchor, async (path, body) => {
    calls.push([path, body]);
    throw new Error('Compaction unavailable');
  });
  assert.deepEqual(calls, [['/api/trees/parent/prepare', anchor]]);
  cancel();
  await Promise.resolve();
  assert.deepEqual(calls, [
    ['/api/trees/parent/prepare', anchor],
    ['/api/trees/parent/unprepare', anchor],
  ]);
});
