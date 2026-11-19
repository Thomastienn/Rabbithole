import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { GROUND, Lights } from '../../server/media/video-kit.tsx';

test("the kit's Lights generate their environment in code, with no file, loader or network", () => {
  const kit = readFileSync(new URL('../../server/media/video-kit.tsx', import.meta.url), 'utf8');
  assert.equal(typeof Lights, 'function');
  assert.equal(GROUND, -2);
  assert.match(kit, /new RoomEnvironment\(\)/);
  assert.doesNotMatch(kit, /Loader|fetch\(|\.hdr|\.exr|https?:/);
});
