import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    appearances,
    fontChoices,
    savedAppearance,
    savedFont,
    savedTheme,
    themeChoices,
} from '../../src/shell/appearance.ts';
import {
    savePreference,
    savedGhostTrees,
    savedLibraryLayout,
    savedVim,
} from '../../src/shell/preferences.ts';
import { DIAGRAM_HUES, diagramTheme } from '../../src/media/diagramTheme.ts';
const { themes } = await import('../../src/astryx-themes.ts');

test('browser preferences restore valid choices independently, fall back safely and tolerate denied storage', (t) => {
    const values = new Map();
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    t.after(() =>
        original
            ? Object.defineProperty(globalThis, 'localStorage', original)
            : delete globalThis.localStorage,
    );
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) },
    });
    assert.equal(savedAppearance(), 'dark');
    assert.equal(savedTheme(null), 'platform');
    assert.equal(savedVim(), false);
    assert.equal(savedLibraryLayout(), 'shelf', 'Shelf is the default');
    savePreference('library-layout', 'list');
    assert.equal(savedLibraryLayout(), 'list');
    savePreference('library-layout', 'garbage');
    assert.equal(savedLibraryLayout(), 'shelf');
    assert.equal(savedGhostTrees(), true, 'Ghost trees are on by default');
    savePreference('ghost-trees', 'off');
    assert.equal(savedGhostTrees(), false);
    savePreference('ghost-trees', 'on');
    assert.equal(savedGhostTrees(), true);
    for (const { id } of appearances) {
        savePreference('appearance', id);
        assert.equal(savedAppearance(), id);
    }
    for (const { id } of themeChoices) {
        savePreference('theme', id);
        assert.equal(savedTheme(values.get('rabbithole.theme')), id);
        assert.equal(savedAppearance(), 'system');
    }
    for (const [value, on] of [
        ['on', true],
        ['off', false],
        ['garbage', false],
    ]) {
        savePreference('vim', value);
        assert.equal(savedVim(), on);
        assert.equal(savedAppearance(), 'system');
        assert.equal(savedTheme(values.get('rabbithole.theme')), 'terminus');
    }
    assert.equal(savedFont('reading-font'), 'atkinson');
    assert.equal(savedFont('interface-font'), 'barlow');
    savePreference('reading-font', 'system');
    assert.equal(savedFont('reading-font'), 'system');
    assert.equal(savedFont('interface-font'), 'barlow', 'reading font leaves interface font alone');
    savePreference('interface-font', 'system');
    savePreference('reading-font', 'atkinson');
    assert.equal(savedFont('interface-font'), 'system');
    assert.equal(savedFont('reading-font'), 'atkinson');
    savePreference('reading-font', 'literata');
    savePreference('interface-font', 'archivo');
    assert.equal(savedFont('reading-font'), 'atkinson', 'retired Literata opens the bundled font');
    assert.equal(savedFont('interface-font'), 'barlow', 'retired Archivo opens the bundled font');
    for (const kind of Object.keys(fontChoices)) {
        savePreference(kind, 'comic-sans');
        assert.equal(savedFont(kind), fontChoices[kind][0].id);
    }
    savePreference('appearance', 'sepia');
    assert.equal(savedAppearance(), 'dark');
    assert.equal(savedTheme('ocean'), 'platform');
    for (const old of ['paperback', 'forest', 'harbor', 'dusk', 'ember', 'graphite'])
        assert.equal(savedTheme(old), 'platform', `retired ${old} opens Platform`);
    assert.equal(values.has('rabbithole.bubble-tint'), false);
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        get() {
            throw new Error('Denied');
        },
    });
    assert.equal(savedAppearance(), 'dark');
    assert.equal(savedVim(), false);
    assert.equal(savedLibraryLayout(), 'shelf');
    assert.equal(savedGhostTrees(), true);
    assert.equal(savedFont('reading-font'), 'atkinson');
    assert.equal(savedFont('interface-font'), 'barlow');
    assert.doesNotThrow(() => savePreference('theme', 'ferry'));
});

const pair = (value) =>
    /^light-dark\(([^,]+),\s*([^)]+)\)$/.exec(value)?.slice(1) ?? [value, value];
const rgb = (hex) => [1, 3, 5].map((n) => parseInt(hex.slice(n, n + 2), 16));
const contrast = (fg, bg) => {
    const lum = (c) =>
        c
            .map((v) => {
                v /= 255;
                return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
            })
            .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
    const [a, b] = [lum(fg), lum(bg)].sort((a, b) => b - a);
    return (a + 0.05) / (b + 0.05);
};

test('every authored and shipped theme module agree on the mockup ground, porcelain focus and ordered family lines', async () => {
    const css = readFileSync('docs/mockups/line-diagram/ld.css', 'utf8');
    const tiles = [];
    for (const { id } of themeChoices) {
        const authored = (await import(`../../src/themes/${id}/${id}Theme.ts`))[`${id}Theme`];
        const theme = themes[id];
        assert.equal(theme.name, id);
        assert.deepEqual(theme.tokens, authored.tokens);
        assert.deepEqual(theme.localTokens, authored.localTokens);
        const mock = css.split(`[data-theme="${id}"] {`)[1].split('}')[0];
        const role = (r) =>
            new RegExp(`--${r}: light-dark\\((#\\w+), (#\\w+)\\)`).exec(mock).slice(1);
        assert.deepEqual(pair(theme.tokens['--color-background-body']), role('g'), `${id} ground`);
        assert.deepEqual(
            pair(theme.localTokens['--rabbithole-paper']),
            role('w'),
            `${id} porcelain`,
        );
        assert.equal(
            theme.tokens['--focus-outline-color'],
            theme.localTokens['--rabbithole-paper'],
        );
        for (const [n, hue] of ['yellow', 'green', 'pink', 'blue'].entries()) {
            assert.deepEqual(
                pair(theme.localTokens[`--rabbithole-ink-${n + 1}`]),
                role(`l${n + 1}`),
            );
            assert.equal(
                theme.tokens[`--color-text-${hue}`],
                theme.localTokens[`--rabbithole-ink-${n + 1}`],
            );
        }
        tiles.push(JSON.stringify(theme.tokens['--color-background-body']));
    }
    assert.equal(new Set(tiles).size, themeChoices.length);
});

test('every theme and side: text, family lines, selection and focus meet WCAG AA', () => {
    for (const theme of Object.values(themes)) {
        const tokens = { ...theme.tokens, ...theme.localTokens };
        for (const mode of [0, 1]) {
            const color = (k) => pair(tokens[k])[mode],
                at = `${theme.name} ${mode ? 'dark' : 'light'}`;
            for (const ground of [
                '--color-background-body',
                '--color-background-surface',
                '--color-background-muted',
                '--color-background-popover',
                // Question bubbles and hover: plain and muted text only.
                '--color-neutral',
            ]) {
                const bg = rgb(color(ground));
                for (const key of [
                    '--color-text-primary',
                    '--color-text-secondary',
                    '--color-text-accent',
                    '--color-text-error',
                ])
                    if (ground !== '--color-neutral' || !/accent|error/.test(key))
                        assert.ok(
                            contrast(rgb(color(key)), bg) >= 4.5,
                            `${at}: ${key} on ${ground}`,
                        );
                // Lines, rings and focus outlines are non-text: 3:1.
                for (const key of [
                    '--rabbithole-ink-1',
                    '--rabbithole-ink-2',
                    '--rabbithole-ink-3',
                    '--rabbithole-ink-4',
                    '--focus-outline-color',
                ])
                    assert.ok(contrast(rgb(color(key)), bg) >= 3, `${at}: ${key} on ${ground}`);
                const sel = color('--rabbithole-selection'),
                    alpha = sel.length === 9 ? parseInt(sel.slice(7), 16) / 255 : 1;
                assert.ok(
                    contrast(
                        rgb(color('--color-text-primary')),
                        rgb(sel).map((v, i) => v * alpha + bg[i] * (1 - alpha)),
                    ) >= 4.5,
                    `${at}: selected text on ${ground}`,
                );
            }
            // Text on porcelain (primary action, address chips) and on each family line.
            for (const fill of [
                '--rabbithole-paper',
                '--color-error',
                '--rabbithole-ink-1',
                '--rabbithole-ink-2',
                '--rabbithole-ink-3',
                '--rabbithole-ink-4',
            ])
                assert.ok(
                    contrast(rgb(color('--rabbithole-paper-ink')), rgb(color(fill))) >= 4.5,
                    `${at}: text on ${fill}`,
                );
        }
    }
});

test('Mermaid palette uses current app ink and surface, with the four family lines in both modes', () => {
    assert.deepEqual(DIAGRAM_HUES, ['yellow', 'blue', 'pink', 'green']);
    for (const theme of Object.values(themes))
        for (const mode of [0, 1]) {
            const series = DIAGRAM_HUES.map((h) => pair(theme.tokens[`--color-text-${h}`])[mode]);
            const style = {
                color: pair(theme.tokens['--color-text-primary'])[mode],
                backgroundColor: pair(theme.tokens['--color-background-surface'])[mode],
                borderColor: 'seam',
                fontSize: '14px',
                fontFamily: 'Barlow',
            };
            const vars = diagramTheme(style, series, mode === 1);
            assert.equal(vars.darkMode, mode === 1);
            assert.equal(vars.textColor, style.color);
            assert.equal(vars.lineColor, style.color);
            assert.equal(vars.primaryColor, style.backgroundColor);
            assert.equal(vars.fontFamily, 'Barlow');
            assert.equal(vars.xyChart.plotColorPalette, series.join(','));
            for (const [i, ink] of series.entries()) {
                assert.equal(vars[`pie${i + 1}`], ink);
                assert.equal(vars[`cScale${i}`], ink);
                assert.equal(vars[`git${i}`], ink);
                assert.equal(vars[`cScaleLabel${i}`], style.backgroundColor);
            }
        }
});
