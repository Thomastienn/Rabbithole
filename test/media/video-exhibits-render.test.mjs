import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync, crc32 } from 'node:zlib';
import { mediaPath } from '../../server/media/videos.mjs';
import { composition, job, planFor, renderSkip, pixel } from '../support/video-kit.mjs';

test(
  'one real short sandboxed cut shows an exhibit framed with its source line',
  { skip: renderSkip, timeout: 240000 },
  async () => {
    // A 32x32 solid blue PNG stands in for a downloaded web image.
    const chunk = (type, data) => {
      const head = Buffer.alloc(4);
      head.writeUInt32BE(data.length);
      const body = Buffer.concat([Buffer.from(type), data]),
        crc = Buffer.alloc(4);
      crc.writeUInt32BE(crc32(body));
      return Buffer.concat([head, body, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(32, 0);
    ihdr.writeUInt32BE(32, 4);
    ihdr.set([8, 2, 0, 0, 0], 8);
    const rows = Buffer.concat(
      Array.from({ length: 32 }, () => Buffer.from([0, ...Array(32).fill([0, 0, 255]).flat()])),
    );
    const image = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(rows)),
      chunk('IEND', Buffer.alloc(0)),
    ]);
    const cut = `import { AbsoluteFill } from 'remotion';
import { Exhibit } from './kit';
export default function Video() { return <AbsoluteFill><Exhibit id="exhibit1" x={960} y={480} width={400} /></AbsoluteFill>; }`;
    const plan = planFor(composition);
    plan.cuts[0].exhibits = [{ kind: 'image', query: 'blue square', show: 'A blue square' }];
    const { result, row, dir } = await job(undefined, undefined, cut, 1, {
      plan,
      search: { status: async () => ({ ready: true }) },
      exhibit: async () => ({
        kind: 'image',
        url: 'https://museum.example/blue.png',
        title: 'Blue square',
        site: 'museum.example',
        bytes: image,
        type: 'image/png',
      }),
    });
    assert.equal(result, null);
    const video = mediaPath(dir, row.id);
    const centre = pixel(video, 1, 960, 480),
      mat = pixel(video, 1, 766, 480),
      ground = pixel(video, 1, 300, 480);
    assert.ok(centre[2] > 200 && centre[0] < 60, `expected the blue image: ${centre}`);
    assert.ok(
      mat.every((c) => c > 200),
      `expected the paper frame: ${mat}`,
    );
    assert.ok(
      ground.every((c) => c < 50),
      `expected the ground outside: ${ground}`,
    );
    // The dim source line sits under the frame: some muted text pixels, none as bright as paper.
    const line = [...Array(40).keys()].map((i) => pixel(video, 1, 770 + i * 2, 700));
    assert.ok(
      line.some((p) => p[0] > 60),
      'expected source line text under the frame',
    );
    assert.ok(
      line.every((p) => p[0] < 200),
      'expected a dim source line',
    );
  },
);
