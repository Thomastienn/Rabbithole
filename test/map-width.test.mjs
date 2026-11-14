import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clampMapWidth,
  keyMapWidth,
  maxMapWidth,
  resetMapWidth,
  savedMapWidth,
} from '../src/map/mapWidth.ts';

test('map width clamps between 20rem and 60% of the workspace', () => {
  assert.equal(clampMapWidth(10, 100), 20);
  assert.equal(clampMapWidth(90, 100), 60);
  assert.equal(clampMapWidth(30, 100), 30);
  assert.equal(maxMapWidth(20), 20, 'a tiny workspace keeps the minimum');
});

test('reset returns the 27.5rem (440px) default, clamped to a narrow workspace', () => {
  assert.equal(resetMapWidth(100), 27.5);
  assert.equal(resetMapWidth(40), 24);
});

test('arrow keys step 1rem (Shift 4rem); Home and End jump to the bounds', () => {
  assert.equal(keyMapWidth(26, 'ArrowLeft', 100), 27);
  assert.equal(keyMapWidth(26, 'ArrowRight', 100), 25);
  assert.equal(keyMapWidth(26, 'ArrowLeft', 100, true), 30);
  assert.equal(keyMapWidth(20, 'ArrowRight', 100), 20);
  assert.equal(keyMapWidth(60, 'ArrowLeft', 100), 60);
  assert.equal(keyMapWidth(30, 'Home', 100), 20);
  assert.equal(keyMapWidth(30, 'End', 100), 60);
  assert.equal(keyMapWidth(30, 'Enter', 100), undefined);
});

test('saved width falls back to the default when missing or invalid', () => {
  assert.equal(savedMapWidth(null), 27.5);
  assert.equal(savedMapWidth('junk'), 27.5);
  assert.equal(savedMapWidth('5'), 27.5);
  assert.equal(savedMapWidth('40'), 40);
});
