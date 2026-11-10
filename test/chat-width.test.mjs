import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampChatWidth, keyChatWidth, maxChatWidth, resetChatWidth, savedChatWidth } from '../src/chatWidth.ts';

test('chat width clamps between 22rem and 70% of the workspace', () => {
  assert.equal(clampChatWidth(10, 100), 22);
  assert.equal(clampChatWidth(90, 100), 70);
  assert.equal(clampChatWidth(30, 100), 30);
  assert.equal(maxChatWidth(20), 22, 'a tiny workspace keeps the readable minimum');
});

test('reset returns the 26rem default, clamped to a narrow workspace', () => {
  assert.equal(resetChatWidth(100), 26);
  assert.equal(resetChatWidth(35), 24.5);
});

test('arrow keys step 1rem (Shift 4rem); Home and End jump to the bounds', () => {
  assert.equal(keyChatWidth(26, 'ArrowLeft', 100), 27);
  assert.equal(keyChatWidth(26, 'ArrowRight', 100), 25);
  assert.equal(keyChatWidth(26, 'ArrowLeft', 100, true), 30);
  assert.equal(keyChatWidth(22, 'ArrowRight', 100), 22);
  assert.equal(keyChatWidth(70, 'ArrowLeft', 100), 70);
  assert.equal(keyChatWidth(30, 'Home', 100), 22);
  assert.equal(keyChatWidth(30, 'End', 100), 70);
  assert.equal(keyChatWidth(30, 'Enter', 100), undefined);
});

test('saved width falls back to the default when missing or invalid', () => {
  assert.equal(savedChatWidth(null), 26);
  assert.equal(savedChatWidth('junk'), 26);
  assert.equal(savedChatWidth('5'), 26);
  assert.equal(savedChatWidth('40'), 40);
});
