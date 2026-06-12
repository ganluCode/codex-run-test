import assert from 'node:assert/strict';
import test from 'node:test';

import { add, subtract } from '../src/calculator.js';

test('add 返回两个数字之和', () => {
  assert.equal(add(1, 2), 3);
});

test('subtract 返回两个数字之差', () => {
  assert.equal(subtract(5, 3), 2);
});
