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
