import assert from 'node:assert/strict';
import test from 'node:test';

import { createTodoStore } from '../src/todoStore.js';

test('createTodoStore 支持新增和列出 Todo，且同一 store 内 id 递增', () => {
  const store = createTodoStore();

  const first = store.add('写测试');
  const second = store.add('补实现');

  assert.deepEqual(first, { id: 1, title: '写测试', completed: false });
  assert.deepEqual(second, { id: 2, title: '补实现', completed: false });
  assert.deepEqual(store.list(), [first, second]);
});

test('list 返回数组副本，外部修改不会影响 store 内部列表', () => {
  const store = createTodoStore();
  store.add('保留内部状态');

  const snapshot = store.list();
  snapshot.push({ id: 999, title: '外部注入', completed: false });

  assert.equal(snapshot.length, 2);
  assert.deepEqual(store.list(), [
    { id: 1, title: '保留内部状态', completed: false },
  ]);
});

test('list 在未传或传入空选项时返回全部 Todo', () => {
  const store = createTodoStore();
  const first = store.add('待办一');
  const second = store.add('待办二');
  store.complete(second.id);

  assert.deepEqual(store.list(), [first, second]);
  assert.deepEqual(store.list(undefined), [first, second]);
  assert.deepEqual(store.list({}), [first, second]);
});

test('list 支持按 completed 状态筛选且不会修改内部状态', () => {
  const store = createTodoStore();
  const first = store.add('未完成');
  const second = store.add('已完成');
  store.complete(second.id);

  assert.deepEqual(store.list({ completed: false }), [first]);
  assert.deepEqual(store.list({ completed: true }), [second]);
  assert.deepEqual(store.list(), [first, second]);
});

test('list 拒绝非布尔值 completed 过滤条件并抛出 TypeError', () => {
  const store = createTodoStore();
  store.add('校验过滤条件');

  assert.throws(() => store.list({ completed: 'yes' }), TypeError);
});

test('stats 在空 store 时返回全 0 统计', () => {
  const store = createTodoStore();

  assert.deepEqual(store.stats(), { total: 0, active: 0, completed: 0 });
});

test('stats 会随着新增和完成 Todo 返回最新计数', () => {
  const store = createTodoStore();

  store.add('第一项');
  const second = store.add('第二项');

  assert.deepEqual(store.stats(), { total: 2, active: 2, completed: 0 });

  store.complete(second.id);

  assert.deepEqual(store.stats(), { total: 2, active: 1, completed: 1 });
});

test('stats 调用不会修改 store 内部数据', () => {
  const store = createTodoStore();
  const first = store.add('保持不变');
  const second = store.add('稍后完成');
  store.complete(second.id);

  const stats = store.stats();

  assert.deepEqual(stats, { total: 2, active: 1, completed: 1 });
  assert.deepEqual(store.list(), [
    first,
    { id: 2, title: '稍后完成', completed: true },
  ]);
});

test('complete 会标记已存在 Todo 为完成并返回更新后的条目', () => {
  const store = createTodoStore();
  store.add('未完成');

  const completed = store.complete(1);

  assert.deepEqual(completed, { id: 1, title: '未完成', completed: true });
  assert.deepEqual(store.list(), [completed]);
});

test('多次调用 createTodoStore 会返回彼此独立的 store 实例', () => {
  const firstStore = createTodoStore();
  const secondStore = createTodoStore();

  firstStore.add('只在第一个 store');

  assert.deepEqual(firstStore.list(), [
    { id: 1, title: '只在第一个 store', completed: false },
  ]);
  assert.deepEqual(secondStore.list(), []);
});

test('add 拒绝空字符串并抛出 TypeError', () => {
  const store = createTodoStore();
  assert.throws(() => store.add(''), TypeError);
  assert.throws(() => store.add('   '), TypeError);
});

test('add 拒绝非字符串 title 并抛出 TypeError', () => {
  const store = createTodoStore();
  assert.throws(() => store.add(null), TypeError);
  assert.throws(() => store.add(123), TypeError);
});

test('remove 删除指定 Todo 并返回被删除的条目', () => {
  const store = createTodoStore();
  store.add('待删除');
  store.add('保留项');

  const removed = store.remove(1);

  assert.deepEqual(removed, { id: 1, title: '待删除', completed: false });
  assert.deepEqual(store.list(), [{ id: 2, title: '保留项', completed: false }]);
});

test('clearCompleted 返回删除数量，并移除所有已完成 Todo', () => {
  const store = createTodoStore();
  const active = store.add('保留项');
  const firstCompleted = store.add('已完成一');
  const secondCompleted = store.add('已完成二');
  store.complete(firstCompleted.id);
  store.complete(secondCompleted.id);

  const clearedCount = store.clearCompleted();

  assert.equal(clearedCount, 2);
  assert.deepEqual(store.list(), [active]);
  assert.deepEqual(store.list({ completed: true }), []);
  assert.deepEqual(store.list({ completed: false }), [active]);
});

test('clearCompleted 在没有已完成 Todo 时返回 0，且不影响现有数据', () => {
  const store = createTodoStore();
  const first = store.add('待办一');
  const second = store.add('待办二');

  const clearedCount = store.clearCompleted();

  assert.equal(clearedCount, 0);
  assert.deepEqual(store.list(), [first, second]);
  assert.deepEqual(store.stats(), { total: 2, active: 2, completed: 0 });
});

test('clearCompleted 后 stats 会反映最新统计结果', () => {
  const store = createTodoStore();
  const first = store.add('已完成');
  const second = store.add('未完成');
  store.complete(first.id);

  const clearedCount = store.clearCompleted();

  assert.equal(clearedCount, 1);
  assert.deepEqual(store.stats(), { total: 1, active: 1, completed: 0 });
  assert.deepEqual(store.list(), [second]);
});

test('complete 在 id 不存在时抛出 RangeError', () => {
  const store = createTodoStore();
  assert.throws(() => store.complete(99), RangeError);
});

test('remove 在 id 不存在时抛出 RangeError', () => {
  const store = createTodoStore();
  assert.throws(() => store.remove(99), RangeError);
});
