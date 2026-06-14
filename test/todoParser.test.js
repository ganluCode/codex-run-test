import assert from 'node:assert/strict';
import test from 'node:test';

import { parseTodoText } from '../src/todoParser.js';

test('parseTodoText 解析普通标题并提供默认 tags 和 priority', () => {
  assert.deepEqual(parseTodoText('buy milk'), {
    title: 'buy milk',
    tags: [],
    priority: 'medium',
  });
});

test('parseTodoText 会去除首尾空白并折叠标题中的连续空白', () => {
  assert.deepEqual(parseTodoText('  buy   milk  '), {
    title: 'buy milk',
    tags: [],
    priority: 'medium',
  });
});

test('parseTodoText 支持提取标签和优先级 token', () => {
  assert.deepEqual(parseTodoText('buy milk #home !high'), {
    title: 'buy milk',
    tags: ['home'],
    priority: 'high',
  });
});

test('parseTodoText 按输入顺序返回标签', () => {
  assert.deepEqual(parseTodoText('fix bug #work #urgent !high'), {
    title: 'fix bug',
    tags: ['work', 'urgent'],
    priority: 'high',
  });
});

test('parseTodoText 对重复标签去重并保留首次出现顺序', () => {
  assert.deepEqual(parseTodoText('fix bug #work #work !low'), {
    title: 'fix bug',
    tags: ['work'],
    priority: 'low',
  });
});

test('parseTodoText 在多个合法优先级 token 中使用最后一个，并且不把控制 token 放入标题', () => {
  assert.deepEqual(parseTodoText('plan sprint !low #team !high'), {
    title: 'plan sprint',
    tags: ['team'],
    priority: 'high',
  });
});

test('parseTodoText 对非字符串输入抛出 TypeError', () => {
  assert.throws(() => parseTodoText(null), TypeError);
  assert.throws(() => parseTodoText(123), TypeError);
});

test('parseTodoText 对空白输入和缺少普通标题文本抛出 TypeError', () => {
  assert.throws(() => parseTodoText('   '), TypeError);
  assert.throws(() => parseTodoText('#home !high'), TypeError);
});

test('parseTodoText 对未知优先级 token 抛出 RangeError', () => {
  assert.throws(() => parseTodoText('buy milk !urgent'), RangeError);
});
