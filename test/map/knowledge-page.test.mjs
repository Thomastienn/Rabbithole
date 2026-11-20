import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { render } from '../support/render.mjs';
import { button } from '../support/ui.mjs';
import { initial, setup } from '../support/knowledge-kit.mjs';
const { default: KnowledgePage } = await import('../../src/knowledge/KnowledgePage.tsx');

test('knowledge points, relations, zoom labels retain accessible state', async (t) => {
  const graph = initial();
  const calls = [];
  const api = async (path, body) => {
    calls.push([path, body]);
    return graph;
  };
  const { container, act, cleanup } = await render(h(KnowledgePage, { api, activity: '' }), setup);
  t.after(cleanup);
  const click = async (label, root = container) => {
    const b = button(root, label);
    assert.ok(b, label);
    await act(async () => {
      b.focus();
      b.click();
    });
  };
  const detail = () => container.querySelector('#concept-detail');
  // Read-only: facts, then observation counts by level in level order with zeros, and no controls.
  assert.equal(
    detail().textContent,
    'MutexTopicsConcurrencyFamiliarityUnfamiliarBuilds onMutual exclusionMet in replies2' +
      'From your messagesMisconception1Heard of it0Partial2Explains it1Applies it0Teaches it0',
  );
  assert.equal(detail().querySelector('[aria-label="Evidence for Mutex"]').tagName, 'DL');
  assert.equal(detail().querySelectorAll('button').length, 0);
  // Familiarity reads without colour: ring form plus words for screen readers.
  assert.deepEqual(
    [...container.querySelectorAll('[data-concept]')].map((b) => [
      b.querySelector('.fam').dataset.fill,
      b.querySelector('.sr-only:last-child').textContent,
    ]),
    [
      ['none', ', Unfamiliar'],
      ['none', ', Unfamiliar'],
      ['none', ', Unfamiliar'],
    ],
  );
  assert.ok(container.querySelector('.knowledge-field .knowledge-key'));
  assert.equal(
    container.querySelector('[data-concept=Mutex]').getAttribute('aria-controls'),
    'concept-detail',
  );
  assert.deepEqual(
    [...container.querySelectorAll('[data-topic-label]')].map((e) => e.textContent),
    ['Concurrency', 'Operating systems'],
  );
  assert.equal(
    container.querySelector('[data-kind="builds on"]').getAttribute('marker-end'),
    'url(#knowledge-arrow)',
  );
  assert.equal(container.querySelector('[data-kind=related]').getAttribute('marker-end'), null);
  assert.equal(
    container.querySelector('.knowledge-key').textContent,
    'UnfamiliarSome familiarityFamiliarLine: relatedArrow: builds on',
  );
  const names = () => [...container.querySelectorAll('[data-concept]')].map((e) => e.textContent);
  const beforeNames = names();
  await act(async () => {
    for (let i = 0; i < 8; i++) button(container, 'Zoom out').click();
  });
  assert.deepEqual(
    [...container.querySelectorAll('.concept-name:not(.sr-only)')].map((e) => e.textContent),
    ['Mutex'],
  );
  await act(async () => container.querySelector('[data-concept=Scheduler]').click());
  assert.equal(detail().querySelector('h2').textContent, 'Scheduler');
  assert.match(detail().textContent, /Related toMutual exclusionMet in replies/);
  // Relations read from the other end too: Leads to reverses builds on, Related to runs both ways.
  await act(async () => container.querySelector('[data-concept="Mutual exclusion"]').click());
  assert.match(detail().textContent, /Leads toMutexRelated toSchedulerMet in replies/);
  await act(async () => container.querySelector('[data-concept=Scheduler]').click());
  assert.deepEqual(
    [...container.querySelectorAll('.concept-name:not(.sr-only)')].map((e) => e.textContent),
    ['Scheduler'],
  );
  assert.deepEqual(names(), beforeNames);
  await act(async () => {
    for (let i = 0; i < 8; i++) button(container, 'Zoom in').click();
  });
  assert.equal(container.querySelectorAll('.concept-name:not(.sr-only)').length, 3);
});
