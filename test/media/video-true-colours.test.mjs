import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planFor, planThrough, composition, styleBrief } from '../support/video-kit.mjs';
import { cutSource, libraryPieces } from '../../server/media/video-plan.mjs';
import { stageCut } from '../../server/media/video-stage.mjs';
import { writeSetPieces } from '../../server/media/video-pieces.mjs';
import { Store } from '../../server/store.mjs';

test('true colours: roles map to an ink or a planned hex, near-white passes, stray hex is rejected, cuts render them', async () => {
    const brief = {
        ...styleBrief,
        trueColors: { earthBlue: '#2b6cb0', boosterWhite: '#f2f0ea' },
        paletteRoles: { winner: 'amber', earth: 'earthBlue', booster: 'boosterWhite' },
    };
    const good = { ...planFor(composition, 2), styleBrief: brief };
    good.cuts[1].engine = 'manim';
    assert.deepEqual(planThrough(good), good);
    for (const trueColors of [
        { earthBlue: 'blue' },
        { earthBlue: '#2b6cb' },
        { earthBlue: '#ffffff' },
        { amber: '#2b6cb0' },
        ['#2b6cb0'],
    ]) {
        const bad = structuredClone(good);
        bad.styleBrief.trueColors = trueColors;
        assert.throws(() => planThrough(bad), /^Error: (?:hex|ink|name) /);
    }
    const unmapped = structuredClone(good);
    unmapped.styleBrief.paletteRoles.earth = 'oceanBlue';
    assert.throws(() => planThrough(unmapped), /^Error: ink /);

    const code = `import { colors, palette } from './kit';
export default () => <div style={{background:palette.ground,color:colors.earth}}><b style={{color:'#F2F0EA'}} /></div>;`;
    assert.equal(cutSource(code, brief), code, 'near-white from the map passes');
    for (const stray of ["'#2b6cb1'", "'#ffffff'"])
        assert.throws(
            () => cutSource(code.replace("'#F2F0EA'", stray), brief),
            /breaks the style brief/,
        );
    assert.throws(() => cutSource(code, styleBrief), /breaks the style brief/);

    const dir = await mkdtemp(join(tmpdir(), 'true-colours-'));
    for (const engine of ['remotion', 'manim'])
        await stageCut({
            dir,
            cut: { engine, code: 'x' },
            plan: good,
            kit: '',
            manimKit: '',
            emphasis: [],
            exhibits: [],
        });
    const kit = await readFile(join(dir, 'kit.tsx'), 'utf8');
    assert.match(kit, /"earth": "#2b6cb0"/);
    assert.match(kit, /"winner": palette\.amber/);
    const manim = JSON.parse(await readFile(join(dir, 'brief.json'), 'utf8'));
    assert.equal(manim.colors.earth, '#2b6cb0', 'Manim cuts colour through the true colour role');
    assert.equal(manim.colors.booster, '#f2f0ea');
});

test('a saved piece keeps its true colours: saved with them, kept on reuse while ink roles remap', async (t) => {
    const brief = {
        ...planFor(composition, 1).styleBrief,
        trueColors: { earthBlue: '#2b6cb0', snow: '#f2f0ea' },
        paletteRoles: { glow: 'amber', earth: 'earthBlue' },
        recurringObjects: [
            { name: 'globe', position: 'centre', colorRole: 'glow', look: 'blue globe' },
        ],
    };
    const globe = `import { colors } from './kit';
export function Globe({ x, y }) { return <div style={{ left: x, top: y, background: colors.earth, borderColor: colors.glow, color: '#f2f0ea' }} />; }`;
    const [entry] = libraryPieces(cutSource(globe, brief, ['Globe']), brief, ['Globe']);
    assert.deepEqual(entry.roles, ['glow', 'earth']);
    assert.deepEqual(entry.trueColors, { snow: '#f2f0ea', earth: '#2b6cb0' });

    const store = new Store(join(mkdtempSync(join(tmpdir(), 'true-colours-')), 'trees.sqlite'));
    t.after(() => store.close());
    const id = store.savePiece(entry, 'old-video');
    const saved = store.pieceTree(id);
    assert.deepEqual(saved.trueColors, entry.trueColors, 'the store keeps true colours');

    const plan = planFor(composition, 1);
    plan.styleBrief = {
        ...plan.styleBrief,
        paletteRoles: { planet: 'leaf' },
        recurringObjects: [
            { name: 'planet', position: 'centre', colorRole: 'planet', look: 'globe' },
        ],
    };
    const { source } = await writeSetPieces({
        plan,
        names: ['Planet'],
        matches: async () => [[saved]],
        signal: new AbortController().signal,
        write: async () =>
            JSON.stringify({ pieces: [{ name: 'Planet', use: 'reuse', id }], code: '' }),
    });
    assert.match(source, /background: "#2b6cb0"/, 'the true colour stays');
    assert.match(source, /borderColor: colors\.planet/, 'the ink role is remapped');
    assert.match(source, /'#f2f0ea'/);
    assert.throws(
        () => cutSource(source, plan.styleBrief, ['Planet']),
        /not a kit color/,
        'outside reuse the hex is still a stray colour',
    );
});
