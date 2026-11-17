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

test(
  'one real short sandboxed cut plays a muted clip exhibit inside its frame',
  { skip: renderSkip, timeout: 240000 },
  async () => {
    // A 3-second solid red H.264 clip stands in for a downloaded and trimmed web video.
    const { execFileSync } = await import('node:child_process');
    const { mkdtempSync, readFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const file = join(mkdtempSync(join(tmpdir(), 'tt-clip-')), 'red.mp4');
    execFileSync('ffmpeg', [
      ...['-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=1280x720:d=3:r=30'],
      ...['-c:v', 'libx264', '-pix_fmt', 'yuv420p', file],
    ]);
    const cut = `import { AbsoluteFill } from 'remotion';
import { Exhibit } from './kit';
export default function Video() { return <AbsoluteFill><Exhibit id="exhibit1" x={960} y={480} width={640} from={0} /></AbsoluteFill>; }`;
    const plan = planFor(composition);
    plan.cuts[0].exhibits = [
      { kind: 'clip', query: 'red footage', show: 'Red footage', start: 0, end: 3, sound: false },
    ];
    const { result, row, dir } = await job(undefined, undefined, cut, 1, {
      plan,
      search: { status: async () => ({ ready: true }) },
      clips: () => ({ ready: true, ytDlp: 'yt-dlp', ffmpeg: 'ffmpeg' }),
      exhibit: async () => ({
        kind: 'clip',
        url: 'https://video.example/watch?v=red',
        title: 'Red footage',
        site: 'video.example',
        seconds: 3,
        bytes: readFileSync(file),
        type: 'video/mp4',
      }),
    });
    assert.equal(result, null);
    const video = mediaPath(dir, row.id);
    const centre = pixel(video, 1, 960, 480),
      ground = pixel(video, 1, 300, 480);
    assert.ok(centre[0] > 200 && centre[1] < 60 && centre[2] < 60, `expected the red clip: ${centre}`);
    assert.ok(
      ground.every((c) => c < 50),
      `expected the ground outside: ${ground}`,
    );
  },
);

test(
  'one real short sandboxed cut pauses its narration while a clip plays its own sound',
  { skip: renderSkip, timeout: 240000 },
  async () => {
    // A 3-second red clip with a loud 440 Hz tone stands in for a downloaded clip with sound.
    const { execFileSync, spawnSync } = await import('node:child_process');
    const { mkdtempSync, readFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const file = join(mkdtempSync(join(tmpdir(), 'tt-clip-')), 'loud.mp4');
    execFileSync('ffmpeg', [
      ...['-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=1280x720:d=3:r=30'],
      ...['-f', 'lavfi', '-i', 'sine=frequency=440:duration=3'],
      ...['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', file],
    ]);
    // The cut shows the exhibit from frame 0; the host starts the footage at the pause instead.
    const cut = `import { AbsoluteFill } from 'remotion';
import { Exhibit } from './kit';
export default function Video() { return <AbsoluteFill><Exhibit id="exhibit1" x={960} y={480} width={640} from={0} /></AbsoluteFill>; }`;
    const plan = planFor(composition);
    plan.cuts[0].exhibits = [
      { kind: 'clip', query: 'loud footage', show: 'Loud footage', start: 0, end: 3, sound: true, sentence: 0 },
    ];
    const { result, row, dir } = await job(undefined, undefined, cut, 1, {
      plan,
      search: { status: async () => ({ ready: true }) },
      clips: () => ({ ready: true, ytDlp: 'yt-dlp', ffmpeg: 'ffmpeg' }),
      exhibit: async () => ({
        kind: 'clip',
        url: 'https://video.example/watch?v=loud',
        title: 'Loud footage',
        site: 'video.example',
        seconds: 3,
        sound: true,
        sentence: 0,
        bytes: readFileSync(file),
        type: 'video/mp4',
      }),
    });
    assert.equal(result, null);
    const video = mediaPath(dir, row.id);
    // The fixture narration's one sentence ends at 1.8 s (frame 54): no footage yet, then red during the pause.
    const before = pixel(video, 1, 960, 480),
      during = pixel(video, 3, 960, 480);
    assert.ok(before.every((c) => c < 60), `expected the black mat before the pause: ${before}`);
    assert.ok(during[0] > 200 && during[1] < 60 && during[2] < 60, `expected the red clip: ${during}`);
    // The MP4 carries the clip's sound inside the pause (1.8 s to 4.8 s): the narration track is silent there.
    const loudness = (start, length) =>
      Number(
        spawnSync(
          'ffmpeg',
          ['-v', 'info', '-ss', String(start), '-t', String(length), '-i', video, '-af', 'volumedetect', '-f', 'null', '-'],
          { encoding: 'utf8' },
        )
          .stderr.match(/mean_volume: (-?[\d.]+) dB/)?.[1] ?? NaN,
      );
    const probe = (args) => execFileSync('ffprobe', ['-v', 'error', ...args, video], { encoding: 'utf8' });
    assert.ok(Number(probe(['-show_entries', 'format=duration', '-of', 'csv=p=0'])) > 4.8, 'expected the video to include the pause');
    const pauseLoudness = loudness(2.2, 2.2);
    assert.ok(pauseLoudness > -35, `expected the clip sound during the pause: ${pauseLoudness} dB`);
  },
);
