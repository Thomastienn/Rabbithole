import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateVisual } from '../../server/media/visuals.mjs';
import { source, fixerTask } from '../support/visual-kit.mjs';
import { patchOf } from '../support/video-kit.mjs';

const input = { request: { title: 'Rounds', shows: 'Winners', alt: 'Winners' }, earlierTitles: [] };
const broken = source.replace('</svg>', '</svg><script>fetch("/api/state")</script>');

// Each call answers the next scripted text, given the task it received.
function writer(answers) {
  const calls = [];
  return {
    calls,
    generate: async (tree, text, emit) => {
      const task = fixerTask(text);
      calls.push({ tree, task });
      emit({ type: 'item', item: 'answer', text: answers[calls.length - 1](task) });
      emit({ type: 'status', status: 'completed' });
    },
  };
}
const run = (provider) =>
  generateVisual(provider, {}, input, new AbortController().signal, 10000, () => {});

test('a visual whose first fragment fails is retried with a patch of it, and a valid patch is ready', async () => {
  const provider = writer([() => broken, (task) => patchOf(task.previousFragment, source)]);
  assert.equal(await run(provider), source);
  assert.equal(provider.calls.length, 2);
  assert.equal(provider.calls[1].task.previousFragment, broken);
  assert.match(provider.calls[1].task.validationError, /preloaded libraries/);
  assert.match(provider.calls[1].tree.instructions, /return only a unified diff/);
});

test('a visual patch that does not apply falls back to a whole fragment', async () => {
  const provider = writer([() => broken, () => '@@ -9,1 +9,1 @@\n-missing\n+line', () => source]);
  assert.equal(await run(provider), source);
  assert.equal(provider.calls.length, 3);
  assert.equal(provider.calls[2].task.previousFragment, undefined);
  assert.match(provider.calls[2].task.validationError, /preloaded libraries/);
  assert.doesNotMatch(provider.calls[2].tree.instructions, /return only a unified diff/);
});
