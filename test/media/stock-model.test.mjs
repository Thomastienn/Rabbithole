import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { Group, Mesh, Object3D } from 'three';
import { loadModels, modelPiece } from '../../src/media/stockModel.ts';

// The smallest GLB: one named mesh with one triangle.
function triangleGlb() {
  const bin = Buffer.from(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer);
  const json = Buffer.from(
    JSON.stringify({
      asset: { version: '2.0' },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0, name: 'piece' }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      accessors: [
        {
          bufferView: 0,
          componentType: 5126,
          count: 3,
          type: 'VEC3',
          min: [0, 0, 0],
          max: [1, 1, 0],
        },
      ],
      bufferViews: [{ buffer: 0, byteLength: bin.length }],
      buffers: [{ byteLength: bin.length }],
    }),
  );
  const padded = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
  const chunk = (data, type) => {
    const head = Buffer.alloc(8);
    head.writeUInt32LE(data.length, 0);
    head.writeUInt32LE(type, 4);
    return Buffer.concat([head, data]);
  };
  const body = Buffer.concat([chunk(padded, 0x4e4f534a), chunk(bin, 0x004e4942)]);
  const header = Buffer.alloc(12);
  header.write('glTF', 0, 'latin1');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + body.length, 8);
  const glb = Buffer.concat([header, body]);
  return glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.length);
}

test('stockPiece returns a fresh THREE object from delivered GLB data; a corrupt or missing 3D piece reports its error in words', async () => {
  const { window } = new JSDOM('<div id="visual"></div>');
  const root = window.document.getElementById('visual');
  const svg = '<svg></svg>';
  const pieces = await loadModels({
    'horse-3d-a1b2c3': triangleGlb(),
    'broken-000000': new TextEncoder().encode('not a model').buffer,
    'fluent-emoji:horse': svg,
  });
  assert.equal(pieces['fluent-emoji:horse'], svg, '2D data passes through');

  const horse = modelPiece(root, pieces, 'horse-3d-a1b2c3');
  assert.ok(horse instanceof Object3D);
  const mesh = horse.getObjectByName('piece');
  assert.ok(mesh instanceof Mesh);
  assert.equal(mesh.geometry.getAttribute('position').count, 3);
  assert.notEqual(
    modelPiece(root, pieces, 'horse-3d-a1b2c3'),
    horse,
    'each call gets its own copy',
  );
  assert.equal(root.childElementCount, 0);

  const broken = modelPiece(root, pieces, 'broken-000000');
  assert.ok(broken instanceof Group, 'a failed piece still adds to a scene');
  assert.match(root.lastElementChild.textContent, /^Stock piece broken-000000 failed to load: .+/);
  modelPiece(root, { 'gone-111111': null }, 'gone-111111');
  assert.equal(root.lastElementChild.textContent, 'Stock piece gone-111111 is missing');
  assert.equal(root.querySelectorAll('[role=status]').length, 2);

  assert.equal(modelPiece(root, pieces, 'fluent-emoji:horse'), null, '2D pieces take the SVG path');
  assert.equal(modelPiece(root, {}, 'fluent-emoji:gone'), null);
  assert.equal(root.childElementCount, 2);
});
