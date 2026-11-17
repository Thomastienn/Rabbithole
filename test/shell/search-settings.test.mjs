import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { render } from '../support/render.mjs';
import { ui, button, inputValue } from '../support/ui.mjs';
const { default: SearchSettings } = await import('../../src/settings/SearchSettings.tsx');

const managed = {
  url: 'http://127.0.0.1:9000',
  managedUrl: 'http://127.0.0.1:9000',
  customUrl: null,
  ready: true,
  error: null,
};

test('Search Settings shows managed URL, tests draft, reports JSON-disabled and network failures, saves and resets', async (t) => {
  const calls = [];
  let saved = { ...managed },
    failure = '';
  let finish;
  const api = async (path, body) => {
    calls.push([path, body]);
    if (!body) return saved;
    if (path.endsWith('/test')) {
      await new Promise((resolve) => {
        finish = resolve;
      });
      return { ...saved, url: body.url, ready: !failure, error: failure || null };
    }
    if (failure) throw new Error(failure);
    saved = body.url ? { ...managed, url: body.url, customUrl: body.url } : { ...managed };
    return saved;
  };
  const { container, act, cleanup } = await render(h(SearchSettings, { api }), ui);
  t.after(cleanup);
  const input = container.querySelector('input');
  assert.ok(input.labels[0], 'the field is labelled');
  assert.equal(input.value, managed.url);
  await act(async () => inputValue(input, 'https://my-search.example.org'));
  await act(async () => button(container, 'Test search').click());
  assert.equal(input.getAttribute('aria-disabled'), 'true');
  assert.equal(input.readOnly, true);
  assert.match(
    [...container.querySelectorAll('[role=status]')].map((node) => node.textContent).join(' '),
    /Checking SearXNG/,
  );
  await act(async () => finish());
  assert.match(
    [...container.querySelectorAll('[role=status]')].map((node) => node.textContent).join(' '),
    /JSON search succeeded/,
  );
  assert.deepEqual(calls.at(-1), [
    '/api/settings/searxng/test',
    { url: 'https://my-search.example.org' },
  ]);
  assert.equal(saved.url, managed.url);
  failure = 'Enable json in search.formats in settings.yml.';
  await act(async () => button(container, 'Test search').click());
  await act(async () => finish());
  assert.match(container.querySelector('[role=alert]').textContent, /Enable json/);
  failure = '';
  await act(async () => button(container, 'Save search URL').click());
  assert.equal(saved.customUrl, 'https://my-search.example.org');
  assert.match(
    [...container.querySelectorAll('[role=status]')].map((node) => node.textContent).join(' '),
    /settings saved/,
  );
  failure = 'Cannot reach SearXNG. Check the URL.';
  await act(async () => button(container, 'Save search URL').click());
  assert.match(container.querySelector('[role=alert]').textContent, /Cannot reach SearXNG/);
  failure = '';
  await act(async () => button(container, 'Use app-managed instance').click());
  assert.equal(input.value, managed.url);
  assert.equal(saved.customUrl, null);
});

test('managed startup failure remains readable while a learner can save their own instance', async (t) => {
  const { container, cleanup } = await render(
    h(SearchSettings, {
      api: async () => ({
        ...managed,
        url: null,
        managedUrl: null,
        ready: false,
        error: 'SearXNG install failed: uv was not found.',
      }),
    }),
    ui,
  );
  t.after(cleanup);
  assert.match(container.querySelector('[role=alert]').textContent, /uv was not found/);
  assert.equal(container.querySelector('input').disabled, false);
  assert.equal(button(container, 'Save search URL').disabled, false);
});

test('Settings can retry a failed initial load without reopening the page', async (t) => {
  let attempts = 0;
  const api = async () => {
    if (++attempts === 1) throw new Error('Settings connection lost.');
    return managed;
  };
  const { container, act, cleanup } = await render(h(SearchSettings, { api }), ui);
  t.after(cleanup);
  assert.match(container.querySelector('[role=alert]').textContent, /connection lost/);
  await act(async () => button(container, 'Retry search settings').click());
  assert.equal(container.querySelector('[role=alert]'), null);
  assert.equal(container.querySelector('input').value, managed.url);
  assert.notEqual(container.querySelector('input').getAttribute('aria-disabled'), 'true');
});
