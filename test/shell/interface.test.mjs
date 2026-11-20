import '../support/tsx.mjs';
import test from 'node:test';
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
            [theme, setTheme] = useState('main'),
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
    // Each swatch: a mini line diagram (trunk plus four family lines), its name and blurb.
    assert.ok(
        themeLabels.every(
            (e, i) =>
                e.querySelectorAll('[data-theme-swatch] > svg path').length === 5 &&
                e.querySelector('.theme-choice-name').textContent === themeChoices[i].label &&
                e.querySelector('.theme-choice-blurb').textContent === themeChoices[i].blurb &&
                e.querySelector('input').labels[0] === e,
        ),
    );
    assert.equal(container.querySelectorAll('.bubble-tint-swatch').length, 0);
    for (const value of ['light', 'system', 'dark']) {
        await act(async () => container.querySelector(`input[value=${value}]`).click());
        assert.equal(container.querySelector(`input[value=${value}]`).checked, true);
        assert.deepEqual(changes.at(-1), ['appearance', value]);
    }
    await act(async () => container.querySelector('input[value=ferry]').click());
    assert.equal(container.querySelector('input[value=ferry]').checked, true);
    assert.equal(container.querySelector('input[value=main]').checked, false);
    assert.equal(container.querySelectorAll('.theme-choice-name svg').length, 1);
    assert.ok(
        container
            .querySelector('input[value=ferry]')
            .closest('label')
            .querySelector('.theme-choice-name svg'),
    );
    assert.equal(container.querySelector('input[value=dark]').checked, true);
    assert.deepEqual(changes.at(-1), ['theme', 'ferry']);
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
    assert.deepEqual(labelsOf(groups[1]), ['Atkinson Hyperlegible Next', 'System']);
    assert.deepEqual(labelsOf(groups[2]), ['Barlow', 'System']);
    assert.equal(groups[1].querySelector('input[value=atkinson]').checked, true);
    assert.equal(groups[2].querySelector('input[value=barlow]').checked, true);
    const html = document.documentElement;
    await act(async () => groups[1].querySelector('input[value=system]').click());
    assert.equal(groups[1].querySelector('input[value=system]').checked, true);
    assert.equal(html.getAttribute('data-reading-font'), 'system');
    assert.notEqual(html.getAttribute('data-interface-font'), 'system');
    assert.equal(localStorage.getItem('rabbithole.reading-font'), 'system');
    await act(async () => groups[2].querySelector('input[value=system]').click());
    await act(async () => groups[1].querySelector('input[value=atkinson]').click());
    assert.equal(html.getAttribute('data-reading-font'), 'atkinson');
    assert.equal(html.getAttribute('data-interface-font'), 'system');
    assert.equal(localStorage.getItem('rabbithole.interface-font'), 'system');
    assert.equal(container.querySelector('input[value=dark]').checked, true);
    const vim = container.querySelector('input[type=checkbox]');
    assert.equal(vim.checked, false);
    assert.ok(vim.labels[0], 'the checkbox is labelled');
    assert.match(
        container.textContent,
        /h j k l act as arrows.*Never while typing, selecting text or using menus/,
    );
    await act(async () => {
        vim.focus();
        vim.click();
    });
    assert.equal(vim.checked, true);
    assert.equal(document.activeElement, vim);
    assert.deepEqual(changes.at(-1), ['vim', true]);
});
