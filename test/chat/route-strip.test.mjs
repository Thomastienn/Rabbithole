import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conversationAddresses } from '../../src/map/treeList.ts';
import { routeStrip } from '../../src/chat/routeStrip.ts';

const rows = (trees) => {
  const addresses = conversationAddresses(trees);
  return trees.map((t) => ({ ...t, ...addresses.get(t.id) }));
};
const draw = (row) => row.segments.map((s) => `${s.ink}:${s.x1},${s.y1}-${s.x2},${s.y2}`).sort();

test('the route strip matches the mockup: families leave the trunk, siblings continue, depth caps at the third column', () => {
  // Tree order as Contents lists it (preorder).
  const strip = routeStrip(
    rows([
      { id: 'a', parent: null, created: 0 }, // 1
      { id: 'b', parent: 'a', created: 1 }, // 1.1
      { id: 'c', parent: 'b', created: 2 }, // 1.1.1
      { id: 'd', parent: 'c', created: 3 }, // 1.1.1.1
      { id: 'e', parent: 'b', created: 4 }, // 1.1.2
      { id: 'f', parent: 'a', created: 5 }, // 1.2
    ]),
  );
  assert.deepEqual(
    strip.map((r) => r.x),
    [12, 28, 44, 44, 44, 28],
  );
  assert.deepEqual(draw(strip[0]), ['0:12,18-12,100%']);
  // 1.1 leaves the trunk at 45 degrees in its own colour; the trunk runs on to 1.2.
  assert.deepEqual(draw(strip[1]), [
    '0:12,0-12,100%',
    '0:12,0-12,2',
    '1:12,2-28,18',
    '1:28,18-28,100%',
  ]);
  // 1.1.1 turns off 1.1; its child and its sibling both continue straight down the third column.
  assert.deepEqual(draw(strip[2]), [
    '0:12,0-12,100%',
    '1:28,0-28,2',
    '1:28,2-44,18',
    '1:44,18-44,100%',
  ]);
  assert.deepEqual(draw(strip[3]), ['0:12,0-12,100%', '1:44,0-44,100%', '1:44,0-44,18']);
  assert.deepEqual(draw(strip[4]), ['0:12,0-12,100%', '1:44,0-44,18']);
  // 1.2 is the second family: a new colour off the trunk.
  assert.deepEqual(draw(strip[5]), ['0:12,0-12,2', '2:12,2-28,18']);
  for (const row of strip)
    for (const s of row.segments)
      if (s.x1 !== s.x2)
        assert.equal(Math.abs(s.x2 - s.x1), s.y2 - s.y1, 'every turn is 45 degrees');
});

test('a conversation whose parent is not listed draws no line into it', () => {
  const [row] = routeStrip([{ id: 'x', parent: 'gone', address: '1', ink: 0 }]);
  assert.deepEqual(row.segments, []);
});
