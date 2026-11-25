import { readFileSync } from 'node:fs';
import { savedTheme, themeChoices } from '../../src/shell/appearance.ts';

// Read Astryx's built colours so visual and video prompts and the browser share one palette.
const palettes = Object.fromEntries(
    themeChoices.map(({ id }) => {
        const css = readFileSync(
            new URL(`../../src/themes/${id}/${id}.css`, import.meta.url),
            'utf8',
        );
        const tokens = [
            '--color-background-body',
            '--color-background-surface',
            '--color-text-primary',
            '--color-text-secondary',
            '--color-border',
            '--color-accent',
            '--focus-outline-color',
            '--color-text-yellow',
            '--color-text-green',
            '--color-text-pink',
            '--color-text-blue',
        ];
        return [
            id,
            Object.fromEntries(
                tokens.map((name) => [
                    name,
                    css
                        .match(new RegExp(`${name}: light-dark\\(([^)]+)\\)`))[1]
                        .split(',')
                        .map((s) => s.trim()),
                ]),
            ),
        ];
    }),
);

export const visualTheme = (theme) => ({
    name: savedTheme(theme?.name),
    mode: theme?.mode === 'light' ? 'light' : 'dark',
});

export function paletteFor(theme) {
    const { name, mode } = visualTheme(theme);
    return {
        name,
        mode,
        tokens: Object.fromEntries(
            Object.entries(palettes[name]).map(([token, pair]) => [
                token,
                pair[mode === 'light' ? 0 : 1],
            ]),
        ),
    };
}
