import '../support/tsx.mjs';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createElement as h, useState } from 'react';
import { render } from '../support/render.mjs';
import { ui } from '../support/ui.mjs';
const { default: InterfaceSettings } = await import('../../src/settings/InterfaceSettings.tsx');
const { themeChoices } = await import('../../src/shell/appearance.ts');

test('Interface shows labelled appearance/theme controls, selections and opt-in Vim help', async (t) => {
  const changes = [];
  let dom;
  function Fixture() {
    const [appearance, setAppearance] = useState('dark'),
      [theme, setTheme] = useState('paperback'),
      [vim, setVim] = useState(false);
    return h(InterfaceSettings, {
      appearance,
      setAppearance: (next) => {
        changes.push(['appearance', next]);
        setAppearance(next);
      },
      theme,
      setTheme: (next) => {
        changes.push(['theme', next]);
        setTheme(next);
      },
      vim,
      setVim: (on) => {
        changes.push(['vim', on]);
        setVim(on);
      },
    });
  }
  const { container, act, cleanup } = await render(h(Fixture), (w) => {
    dom = ui(w);
  });
  t.after(cleanup);
  await act(async () => dom.frames());
  assert.match(
    container.querySelector('[role=radiogroup]').getAttribute('aria-label') ??
      container.querySelector('[role=radiogroup]').textContent,
    /Appearance|Dark/,
  );
  assert.deepEqual(
    [...container.querySelector('[role=radiogroup]').querySelectorAll('input[type=radio]')].map(
      (e) => document.getElementById(e.getAttribute('aria-labelledby')).textContent.trim(),
    ),
    ['Dark', 'Light', 'System'],
  );
  const themeLabels = [...container.querySelectorAll('.theme-choice')];
  assert.deepEqual(
    themeLabels.map((e) => e.querySelector('input').value),
    themeChoices.map((t) => t.id),
  );
  assert.ok(
    themeLabels.every(
      (e) =>
        e.querySelectorAll('.theme-tile-inks i').length === 5 &&
        e.querySelector('[data-theme-swatch]'),
    ),
  );
  assert.equal(container.querySelectorAll('.bubble-tint-swatch').length, 0);
  for (const value of ['light', 'system', 'dark']) {
    await act(async () => container.querySelector(`input[value=${value}]`).click());
    assert.equal(container.querySelector(`input[value=${value}]`).checked, true);
    assert.deepEqual(changes.at(-1), ['appearance', value]);
  }
  await act(async () => container.querySelector('input[value=forest]').click());
  assert.equal(container.querySelector('input[value=forest]').checked, true);
  assert.equal(container.querySelector('input[value=paperback]').checked, false);
  assert.equal(container.querySelectorAll('.theme-choice-name svg').length, 1);
  assert.ok(
    container
      .querySelector('input[value=forest]')
      .closest('label')
      .querySelector('.theme-choice-name svg'),
  );
  assert.equal(container.querySelector('input[value=dark]').checked, true);
  assert.deepEqual(changes.at(-1), ['theme', 'forest']);
  // Font choices: named radio lists after Theme, each switching only its own <html> attribute.
  const groups = [...container.querySelectorAll('[role=radiogroup]')];
  const labelsOf = (g) =>
    [...g.querySelectorAll('input[type=radio]')].map((e) =>
      document.getElementById(e.getAttribute('aria-labelledby')).textContent.trim(),
    );
  assert.deepEqual(
    groups.map((g) =>
      g
        .getAttribute('aria-labelledby')
        .split(' ')
        .map((id) => document.getElementById(id).textContent.trim())
        .join(' '),
    ),
    ['Appearance', 'Reading font', 'Interface font'],
  );
  assert.deepEqual(labelsOf(groups[1]), ['Literata', 'System']);
  assert.deepEqual(labelsOf(groups[2]), ['Archivo', 'System']);
  assert.equal(groups[1].querySelector('input[value=literata]').checked, true);
  assert.equal(groups[2].querySelector('input[value=archivo]').checked, true);
  const html = document.documentElement;
  await act(async () => groups[1].querySelector('input[value=system]').click());
  assert.equal(groups[1].querySelector('input[value=system]').checked, true);
  assert.equal(html.getAttribute('data-reading-font'), 'system');
  assert.notEqual(html.getAttribute('data-interface-font'), 'system');
  assert.equal(localStorage.getItem('rabbithole.reading-font'), 'system');
  await act(async () => groups[2].querySelector('input[value=system]').click());
  await act(async () => groups[1].querySelector('input[value=literata]').click());
  assert.equal(html.getAttribute('data-reading-font'), 'literata');
  assert.equal(html.getAttribute('data-interface-font'), 'system');
  assert.equal(localStorage.getItem('rabbithole.interface-font'), 'system');
  assert.equal(container.querySelector('input[value=dark]').checked, true);
  const css = readFileSync(new URL('../../src/styles/shell.css', import.meta.url), 'utf8');
  const rule = (kind) =>
    css.match(
      new RegExp(`html\\[data-${kind}='system'\\] \\[data-astryx-theme\\] \\{([^}]*)\\}`),
    )[1];
  assert.deepEqual(
    [...rule('reading-font').matchAll(/--[\w-]+/g)].map((m) => m[0]),
    ['--rabbithole-font-reading'],
  );
  assert.deepEqual(
    [...rule('interface-font').matchAll(/--[\w-]+/g)].map((m) => m[0]),
    ['--font-family-body', '--font-family-heading'],
  );
  assert.doesNotMatch(css, /--font-family-code:/, 'code stays monospace');
  const vim = container.querySelector('input[type=checkbox]');
  assert.equal(vim.checked, false);
  assert.match(vim.labels[0].textContent, /Vim canvas bindings/);
  assert.match(
    container.textContent,
    /h j k l act as arrows.*Never while typing, selecting text or using menus/,
  );
  assert.deepEqual(
    [...container.querySelectorAll('.settings-keys dt')].map((e) => e.textContent),
    [
      'Pan the map, or move the focused conversation',
      'Move farther',
      'Open the focused conversation',
      'Close Settings',
    ],
  );
  await act(async () => {
    vim.focus();
    vim.click();
  });
  assert.equal(vim.checked, true);
  assert.equal(document.activeElement, vim);
  assert.deepEqual(changes.at(-1), ['vim', true]);
});
