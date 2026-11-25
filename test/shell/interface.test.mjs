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
    // Appearance: one segmented choice (mockup Settings), System, Light, Dark with icons.
    const appearance = container.querySelector('[role=radiogroup][aria-label=Appearance]');
    const segment = (value) => appearance.querySelector(`[data-value=${value}]`);
    assert.deepEqual(
        [...appearance.querySelectorAll('[role=radio]')].map((e) => e.textContent.trim()),
        ['System', 'Light', 'Dark'],
    );
    assert.ok(
        [...appearance.querySelectorAll('[role=radio]')].every((e) => e.querySelector('svg')),
    );
    assert.equal(segment('dark').getAttribute('aria-checked'), 'true');
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
        await act(async () => segment(value).click());
        assert.equal(segment(value).getAttribute('aria-checked'), 'true');
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
    assert.equal(segment('dark').getAttribute('aria-checked'), 'true');
    assert.deepEqual(changes.at(-1), ['theme', 'ferry']);
    // Branch family inks: the four lines of the current theme, in order.
    assert.deepEqual(
        [...container.querySelectorAll('.settings-inks li')].map((e) => [
            e.textContent,
            e.querySelector('s').style.background,
        ]),
        [
            ['First branch', 'var(--rabbithole-ink-1)'],
            ['Second', 'var(--rabbithole-ink-2)'],
            ['Third', 'var(--rabbithole-ink-3)'],
            ['Fourth', 'var(--rabbithole-ink-4)'],
        ],
    );
    // Fonts: two select buttons side by side, each switching only its own <html> attribute.
    const [interfaceFont, readingFont] = container.querySelectorAll(
        '.settings-fonts [role=combobox]',
    );
    assert.deepEqual(
        [interfaceFont, readingFont].map((b) => [b.labels?.[0]?.textContent, b.textContent]),
        [
            ['Interface font', 'Barlow'],
            ['Reading font', 'Atkinson Hyperlegible Next'],
        ],
    );
    const choose = async (box, label) => {
        await act(async () => box.click());
        await act(async () => dom.frames());
        const options = [
            ...document
                .getElementById(box.getAttribute('aria-controls'))
                .querySelectorAll('[role=option]'),
        ];
        assert.deepEqual(
            options.map((o) => o.textContent.trim()).includes(label),
            true,
            `${label} offered`,
        );
        await act(async () => options.find((o) => o.textContent.trim() === label).click());
        await act(async () => dom.frames());
    };
    const html = document.documentElement;
    await choose(readingFont, 'System');
    assert.equal(readingFont.textContent, 'System');
    assert.equal(html.getAttribute('data-reading-font'), 'system');
    assert.notEqual(html.getAttribute('data-interface-font'), 'system');
    assert.equal(localStorage.getItem('rabbithole.reading-font'), 'system');
    await choose(interfaceFont, 'System');
    await choose(readingFont, 'Atkinson Hyperlegible Next');
    assert.equal(html.getAttribute('data-reading-font'), 'atkinson');
    assert.equal(html.getAttribute('data-interface-font'), 'system');
    assert.equal(localStorage.getItem('rabbithole.interface-font'), 'system');
    assert.equal(segment('dark').getAttribute('aria-checked'), 'true');
    // Vim: a switch with its keys listed below.
    const vim = container.querySelector('input[role=switch]');
    assert.equal(vim.checked, false);
    assert.ok(vim.labels[0], 'the switch is labelled');
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
