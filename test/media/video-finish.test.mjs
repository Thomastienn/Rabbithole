import assert from 'node:assert/strict';
import test from 'node:test';
import { finish, palette } from '../../server/media/video-kit.tsx';
import { patternTexture } from '../../server/media/video-finish.tsx';
import { cutSource } from '../../server/media/video-plan.mjs';
import { remapRoles } from '../../server/media/video-pieces.mjs';
import { CUT_3D, PIECES_3D, PIECE_IMPROVE_INSTRUCTIONS } from '../../server/media/video-cut.mjs';
import { HOUSE_STYLE_SKILL } from '../../server/media/skills.mjs';
import { styleBrief } from '../support/video-kit.mjs';

const finishes = ['matte', 'plastic', 'metal', 'glass', 'glow'];
const patterns = ['wood', 'brushed metal', 'panel lines', 'fabric', 'stone', 'tiles', 'bands'];

test('each finish and pattern gives a material in the given colour; a pattern is one soft texture per name', () => {
    for (const kind of finishes) {
        const m = finish(kind, palette.amber);
        assert.equal(`#${m.color.getHexString()}`, palette.amber);
        assert.equal(m.map, null);
        assert.equal(finish(kind, palette.amber), m, 'cached, so per-frame calls reuse it');
    }
    assert.equal(`#${finish('glow', palette.leaf).emissive.getHexString()}`, palette.leaf);
    for (const name of patterns) {
        const m = finish('matte', '#3366aa', name);
        assert.equal(`#${m.color.getHexString()}`, '#3366aa');
        assert.equal(m.map, patternTexture(name));
        assert.equal(m.bumpMap, m.map, 'relief matches the pattern');
        assert.equal(finish('metal', palette.paper, name).map, m.map, 'same name, same texture');
        const grey = m.map.image.data.filter((_, i) => i % 4 === 0);
        const [lo, hi] = [Math.min(...grey), Math.max(...grey)];
        assert.ok(
            lo >= 209 && hi <= 255 && hi - lo > 10,
            `${name} is soft but visible: ${lo}-${hi}`,
        );
    }
});

test('the finish colour passes the colour validator like any other colour', () => {
    const cut = (colour) => `import {colors, palette, finish} from './kit';
export default () => <mesh material={finish('metal', ${colour}, 'wood')} />;`;
    for (const ok of ['colors.winner', 'palette.paper', "'#dfae4e'", 'props.tint'])
        assert.equal(cutSource(cut(ok), styleBrief), cut(ok));
    for (const bad of ["'red'", "'#ff0000'", 'palette.leaf', 'colors.missing'])
        assert.throws(() => cutSource(cut(bad), styleBrief), /style brief colors/);
    const brief = { ...styleBrief, trueColors: { ocean: '#2255aa' } };
    assert.ok(cutSource(cut("'#2255aa'"), brief));
});

test('3D guidance and the house style name the finishes and patterns and still forbid loaders and files', () => {
    for (const prompt of [CUT_3D, PIECES_3D, PIECE_IMPROVE_INSTRUCTIONS]) {
        assert.match(prompt, /finish\(kind, colour, pattern\?\)/);
        assert.match(prompt, /no loaders, files or textures of your own/);
    }
    for (const name of [...finishes, ...patterns]) {
        assert.ok(CUT_3D.includes(name), name);
        assert.ok(HOUSE_STYLE_SKILL.includes(name), name);
    }
    assert.match(HOUSE_STYLE_SKILL, /photoreal textures, noise or clutter/);
});

test('a reused set piece keeps its finishes and patterns with its roles remapped', () => {
    const saved = `import { colors, finish } from './kit';
export function Guitar3D() { return <mesh material={finish('plastic', colors.body, 'wood')} />; }`;
    const reused = remapRoles(saved, ['body'], 'winner', styleBrief);
    assert.match(reused, /finish\('plastic', colors\.winner, 'wood'\)/);
    assert.ok(cutSource(reused, styleBrief, ['Guitar3D']));
});
