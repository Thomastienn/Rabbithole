import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { render } from '../support/render.mjs';
import { ui, button, inputValue } from '../support/ui.mjs';
const { default: EndpointSettings } = await import('../../src/settings/EndpointSettings.tsx');

test('endpoint settings add, reject duplicates, show failed tests, guard URL edits and confirm removal', async (t) => {
  const at = new Date().toISOString();
  let list = [
    {
      id: 'openai',
      name: 'Custom endpoint',
      baseUrl: 'http://a/v1',
      acceptsImages: false,
      lastTest: null,
    },
  ];
  const calls = [];
  const api = async (path, body) => {
    if (body) calls.push([path, body]);
    if (path === '/api/settings/endpoints' && body) {
      if (list.some((e) => e.name.toLowerCase() === body.name.toLowerCase()))
        throw new Error(`Another endpoint is called ${body.name}. Choose a different name.`);
      list = [
        ...list,
        {
          id: 'openai:gw',
          name: body.name,
          baseUrl: body.baseUrl,
          acceptsImages: body.acceptsImages,
          lastTest: null,
        },
      ];
    }
    if (path.endsWith('/test'))
      list = list.map((e) =>
        e.id === body.id
          ? {
              ...e,
              lastTest:
                calls.filter(([p]) => p.endsWith('/test')).length === 1
                  ? { ok: false, error: 'Work gateway rejected the API key.', at }
                  : { ok: true, models: 1, at },
            }
          : e,
      );
    if (path.endsWith('/edit'))
      list = list.map((e) =>
        e.id === body.id ? { ...e, name: body.name, acceptsImages: body.acceptsImages } : e,
      );
    if (path.endsWith('/remove')) list = list.filter((e) => e.id !== body.id);
    return list;
  };
  let changed = 0;
  const { container, act, cleanup } = await render(
    h(EndpointSettings, { api, changed: () => changed++ }),
    ui,
  );
  t.after(cleanup);
  await act(async () => {});
  const row = (id) => container.querySelector(`.endpoint-row[data-endpoint="${id}"]`);
  const field = (label) =>
    [...container.querySelectorAll('.endpoint-form input')].find((i) =>
      i.labels?.[0]?.textContent.startsWith(label),
    );
  const submit = () => act(async () => container.querySelector('.endpoint-form').requestSubmit());
  assert.match(row('openai').textContent, /Custom endpoint.*http:\/\/a\/v1.*Not tested/);

  await act(async () => button(container, 'Add endpoint').click());
  assert.equal(
    container.querySelector('.endpoint-form').getAttribute('aria-label'),
    'New endpoint',
  );
  assert.equal(field('API key').type, 'password');
  await act(async () => {
    inputValue(field('Name'), 'custom endpoint');
    inputValue(field('Base URL'), 'http://gw/v1');
    inputValue(field('API key'), 'secret');
  });
  await submit();
  assert.match(
    container.textContent,
    /Another endpoint is called custom endpoint\. Choose a different name\./,
  );
  assert.equal(field('API key').value, '', 'the key is cleared after a rejected save');
  await act(async () => {
    inputValue(field('Name'), 'Work gateway');
    inputValue(field('API key'), 'secret');
  });
  // Accepts images is off by default and saved with the endpoint.
  const images = () => container.querySelector('.endpoint-form [role=switch]');
  assert.match(images().labels[0].textContent, /Accepts images/);
  assert.match(
    container.querySelector('.endpoint-form').textContent,
    /When off, images are sent as OCR text and their slips say so\./,
  );
  assert.equal(images().checked, false);
  await act(async () => images().click());
  await submit();
  assert.deepEqual(calls.at(-1), [
    '/api/settings/endpoints',
    { name: 'Work gateway', baseUrl: 'http://gw/v1', apiKey: 'secret', acceptsImages: true },
  ]);
  assert.equal(container.querySelector('.endpoint-form'), null, 'the form closes after saving');
  assert.match(container.textContent, /Work gateway added\. Choose its models in any model menu\./);
  assert.ok(!container.innerHTML.includes('secret'), 'the key is never shown');

  // A failed test stays on the row, is announced and offers Test again.
  await act(async () => button(container, 'Test Work gateway').click());
  assert.match(
    row('openai:gw').querySelector('[role=alert]').textContent,
    /^Test failed · Work gateway rejected the API key\. · today/,
  );
  assert.ok(button(row('openai:gw'), 'Test Work gateway again'));

  // Edit: a URL change warns and needs the key; restoring it (trailing slash ignored) clears that.
  await act(async () => button(container, 'Edit Work gateway').click());
  assert.equal(field('API key').value, '');
  assert.equal(images().checked, true, 'editing shows the saved switch');
  await act(async () => images().click());
  const save = () => button(container.querySelector('.endpoint-form'), 'Save');
  await act(async () => inputValue(field('Base URL'), 'http://a/v1'));
  assert.match(container.textContent, /URL changed: enter the key again/);
  assert.equal(save().disabled, true, 'Save waits for the key');
  await act(async () => {
    inputValue(field('Base URL'), 'http://gw/v1/');
    inputValue(field('Name'), 'Team gateway');
  });
  assert.doesNotMatch(container.textContent, /URL changed/);
  assert.equal(save().disabled, false);
  await submit();
  assert.deepEqual(calls.slice(-2), [
    [
      '/api/settings/endpoints/edit',
      { id: 'openai:gw', name: 'Team gateway', baseUrl: 'http://gw/v1/', acceptsImages: false },
    ],
    ['/api/settings/endpoints/test', { id: 'openai:gw' }],
  ]);
  assert.match(row('openai:gw').textContent, /Team gateway.*1 model listed · tested today/);
  assert.equal(row('openai:gw').querySelector('[role=alert]'), null, 'saving clears the failure');

  // Remove asks first; Cancel keeps the endpoint; confirming removes only that one.
  const dialog = () => document.querySelector('.endpoint-remove-dialog');
  await act(async () => button(container, 'Remove Team gateway').click());
  assert.match(
    dialog().textContent,
    /Remove Team gateway\?.*Its saved key is deleted\..*keep their content/,
  );
  await act(async () => button(dialog(), 'Cancel').click());
  assert.equal(dialog(), null);
  assert.equal(list.length, 2);
  await act(async () => button(container, 'Remove Team gateway').click());
  await act(async () => button(dialog(), 'Remove').click());
  assert.deepEqual(
    list.map((e) => e.name),
    ['Custom endpoint'],
  );
  assert.match(
    container.textContent,
    /Team gateway removed\. Conversations that used it keep their content\./,
  );

  await act(async () => button(container, 'Remove Custom endpoint').click());
  await act(async () => button(dialog(), 'Remove').click());
  assert.match(container.textContent, /No custom endpoints yet/);
  assert.ok(changed > 0, 'every change notifies the model menus');
});
