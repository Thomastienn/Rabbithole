import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';

test('meeting a concept in many replies stays low; asking and using dominate; the prompt list is bounded', () => {
  const store = new Store(join(mkdtempSync(join(tmpdir(), 'tt-familiar-')), 'trees.sqlite'));
  const graph = (names, message) =>
    store.addGraph(
      { concepts: names.map((name) => ({ name, topics: ['T'] })), links: [] },
      message,
    );
  for (let i = 0; i < 50; i++) graph(['Met'], `m${i}`);
  const of = (name) => store.familiarity(store.concept(name).id).familiarity;
  assert.equal(of('Met'), 0.12, 'met-only familiarity stops at its low ceiling');
  store.evidence(store.concept('Met').id, 'used', 'u1');
  store.evidence(store.concept('Met').id, 'asked', 'a1');
  assert.equal(of('Met'), 0.62);
  store.correct('Met', 'unknown');
  assert.equal(of('Met'), 0);

  // The prompt list: this learning tree's strong-evidence concepts only, newest first, at most 12 of each.
  const tree = store.create().id,
    other = store.create().id;
  const reply = store.message(tree, 'assistant', 'r', 'completed');
  const names = Array.from({ length: 15 }, (_, i) => `C${i}`);
  graph([...names, 'Only met'], reply);
  names.forEach((n) => store.evidence(store.concept(n).id, 'used', reply));
  const { known, shaky } = store.strongConcepts(tree);
  assert.deepEqual(known, names.slice(3).reverse());
  assert.deepEqual(shaky, []);
  assert.deepEqual(store.strongConcepts(other), { known: [], shaky: [] });
});
