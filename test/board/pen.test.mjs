import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { strokeImage } from '../../server/board/pen.mjs';

test('board pen: a stroke on a later page is cropped from that page', async () => {
    const png = await strokeImage([
        [1400, 1000],
        [1500, 1060],
    ]);
    const meta = await sharp(png).metadata();
    assert.deepEqual([meta.width, meta.height], [180, 140], 'the stroke plus 40 px around it');
});
