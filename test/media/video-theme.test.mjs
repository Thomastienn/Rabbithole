import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planFor, composition } from '../support/video-kit.mjs';
import { videoPalette, roleColor } from '../../server/media/video-colors.mjs';
import { paletteFor } from '../../server/media/theme-palette.mjs';
import { cutSource } from '../../server/media/video-plan.mjs';
import { stageCut } from '../../server/media/video-stage.mjs';
import { palette, series, setPalette, three, type } from '../../server/media/video-kit.tsx';

test('a video palette comes from the app theme and mode it is made in', () => {
    const light = videoPalette({ name: 'main', mode: 'light' });
    const dark = videoPalette({ name: 'main', mode: 'dark' });
    const tokens = paletteFor({ name: 'main', mode: 'light' }).tokens;
    assert.equal(light.ground, tokens['--color-background-body']);
    assert.equal(light.paper, tokens['--color-text-primary']);
    assert.equal(light.amber, tokens['--color-text-yellow']);
    assert.equal(light.seam, light.paper + '1f');
    assert.notEqual(light.ground, dark.ground);
    for (const name of ['main', 'enamel', 'ferry', 'platform', 'terminus', 'timetable', 'tunnel'])
        for (const mode of ['light', 'dark'])
            for (const hex of Object.values(videoPalette({ name, mode })))
                assert.match(hex, /^#[\da-f]{6}(?:[\da-f]{2})?$/i, `${name} ${mode}`);
    assert.deepEqual(videoPalette(), videoPalette({ name: 'platform', mode: 'dark' }));
});

test('the brief palette reaches roles, the validator, the staged kit and Manim', async () => {
    const plan = planFor(composition, 1);
    const brief = (plan.styleBrief = {
        ...plan.styleBrief,
        palette: videoPalette({ name: 'main', mode: 'light' }),
    });
    const role = Object.keys(brief.paletteRoles)[0];
    assert.equal(roleColor(brief, role), brief.palette[brief.paletteRoles[role]]);
    const code = (hex) => `import { palette } from './kit';
export default () => <div style={{background:palette.ground,color:'${hex}'}} />;`;
    assert.ok(cutSource(code(brief.palette.paper), brief), 'a theme neutral literal passes');
    assert.throws(() => cutSource(code('#efe6d6'), brief), /breaks the style brief/);

    const dir = await mkdtemp(join(tmpdir(), 'video-theme-'));
    for (const engine of ['remotion', 'manim'])
        await stageCut({ dir, cut: { engine, code: 'x' }, plan, kit: '', emphasis: [] });
    assert.ok(
        (await readFile(join(dir, 'kit.tsx'), 'utf8')).includes(
            `setPalette(${JSON.stringify(brief.palette)});`,
        ),
    );
    const manim = JSON.parse(await readFile(join(dir, 'brief.json'), 'utf8'));
    assert.equal(manim.palette.ground, brief.palette.ground);
});

test('setPalette repaints the kit in place', () => {
    const next = videoPalette({ name: 'enamel', mode: 'light' });
    setPalette(next);
    assert.deepEqual(palette, next);
    assert.deepEqual(series, [next.amber, next.leaf, next.rust, next.lichen]);
    assert.equal(type.title.color, next.paper);
    assert.equal(type.caption.color, next.muted);
    assert.equal(three.background, next.ground);
    assert.equal(three.materials.rust, next.rust);
});
