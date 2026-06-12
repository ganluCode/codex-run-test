import assert from 'node:assert/strict';
import test from 'node:test';

import { add, subtract, multiply, divide } from '../src/calculator.js';

test('add 返回两个数字之和', () => {
  assert.equal(add(1, 2), 3);
});

test('subtract 返回两个数字之差', () => {
  assert.equal(subtract(5, 3), 2);
});

test('multiply 返回两个数字之积', () => {
  assert.equal(multiply(3, 4), 12);
});

test('divide 返回两个数字之商', () => {
  assert.equal(divide(6, 3), 2);
});

test('非数字输入抛出 TypeError', () => {
  assert.throws(() => add('1', 2), TypeError);
  assert.throws(() => subtract(null, 2), TypeError);
  assert.throws(() => multiply(undefined, 2), TypeError);
  assert.throws(() => divide('a', 2), TypeError);
});

test('NaN 输入抛出 TypeError', () => {
  assert.throws(() => add(NaN, 1), TypeError);
  assert.throws(() => divide(1, NaN), TypeError);
});

test('Infinity 输入抛出 TypeError', () => {
  assert.throws(() => add(Infinity, 1), TypeError);
  assert.throws(() => subtract(1, -Infinity), TypeError);
});

test('除零抛出 RangeError', () => {
  assert.throws(() => divide(5, 0), RangeError);
});
