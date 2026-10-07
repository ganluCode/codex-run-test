import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createTodoStore } from '../src/todoStore.js';

function makeTempDir(t) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'todo-store-lifecycle-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function readBytes(filePath) {
  return readFileSync(filePath);
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

test('生命周期回归：嵌套目录首次初始化 → CRUD → 跨实例恢复 → reload 获取最新数据', (t) => {
  const dir = makeTempDir(t);
  const filePath = path.join(dir, 'nested', 'deep', 'todos.json');

  // 1) 文件与多级父目录不存在时，首次初始化写出有效空 JSON。
  assert.equal(existsSync(filePath), false);
  const first = createTodoStore({ filePath });
  assert.equal(existsSync(filePath), true);
  assert.deepEqual(readJson(filePath), { todos: [], nextId: 1 });
  assert.deepEqual(first.list(), []);

  // 2) 在同一实例完成新增，断言返回项与列表的完整字段。
  const alpha = first.add('写实现');
  const beta = first.add('写测试');
  assert.deepEqual(alpha, { id: 1, title: '写实现', completed: false });
  assert.deepEqual(beta, { id: 2, title: '写测试', completed: false });
  assert.deepEqual(first.list(), [alpha, beta]);

  // 3) 完成与删除后，新实例从同一文件恢复完整的 id/title/completed。
  first.complete(alpha.id);
  first.remove(beta.id);
  const second = createTodoStore({ filePath });
  assert.deepEqual(second.list(), [
    { id: 1, title: '写实现', completed: true },
  ]);
  assert.deepEqual(readJson(filePath), {
    todos: [{ id: 1, title: '写实现', completed: true }],
    nextId: 3,
  });

  // 4) 第二个实例继续修改后，旧实例必须显式 reload() 才能看到最新数据。
  const gamma = second.add('补文档');
  assert.deepEqual(second.list(), [
    { id: 1, title: '写实现', completed: true },
    { id: 3, title: '补文档', completed: false },
  ]);
  // reload 前旧实例仍保留自己的快照。
  assert.deepEqual(first.list(), [
    { id: 1, title: '写实现', completed: true },
  ]);

  first.reload();
  assert.deepEqual(first.list(), [
    { id: 1, title: '写实现', completed: true },
    { id: 3, title: '补文档', completed: false },
  ]);
  // reload 恢复下一可用 ID：旧实例新增不与 gamma 冲突。
  const delta = first.add('继续');
  assert.equal(delta.id, 4);
  assert.deepEqual(gamma, { id: 3, title: '补文档', completed: false });
});

test('生命周期回归：删除最高 ID、删除全部及 reload 后继续新增，ID 均不复用', (t) => {
  const dir = makeTempDir(t);
  const filePath = path.join(dir, 'todos.json');

  const store = createTodoStore({ filePath });
  store.add('一');
  store.add('二');
  store.add('三');

  // 删除最高 ID 后，下一实例继续新增不复用 3。
  const removedTop = store.remove(3);
  assert.deepEqual(removedTop, { id: 3, title: '三', completed: false });
  const restoredAfterTop = createTodoStore({ filePath });
  const fourth = restoredAfterTop.add('四');
  assert.equal(fourth.id, 4);

  // 删除剩余全部任务，重新创建实例后 ID 依旧递增。
  restoredAfterTop.remove(1);
  restoredAfterTop.remove(2);
  restoredAfterTop.remove(4);
  assert.deepEqual(restoredAfterTop.list(), []);
  assert.deepEqual(readJson(filePath), { todos: [], nextId: 5 });

  const restoredAfterAll = createTodoStore({ filePath });
  assert.deepEqual(restoredAfterAll.list(), []);
  const fifth = restoredAfterAll.add('五');
  assert.equal(fifth.id, 5);

  // 旧实例 reload() 后继续新增，仍然不复用已分配的 ID。
  store.reload();
  assert.deepEqual(store.list(), [{ id: 5, title: '五', completed: false }]);
  const sixth = store.add('六');
  assert.equal(sixth.id, 6);
  assert.deepEqual(
    store.list().map((item) => item.id),
    [5, 6]
  );
});

test('生命周期回归：损坏 JSON 在构造与 reload 两种路径均失败且原文件保留', (t) => {
  const dir = makeTempDir(t);

  // 构造路径：损坏文件抛出含路径与原因的错误，字节不变。
  const constructPath = path.join(dir, 'construct.json');
  writeFileSync(constructPath, '{ "todos": [', 'utf8');
  const constructBefore = readBytes(constructPath);
  assert.throws(
    () => createTodoStore({ filePath: constructPath }),
    (error) =>
      error instanceof Error &&
      error.message.includes(constructPath) &&
      error.message.includes('损坏')
  );
  assert.deepEqual(readBytes(constructPath), constructBefore);

  // reload 路径：损坏后实例保留旧状态，文件字节不变。
  const reloadPath = path.join(dir, 'reload.json');
  const store = createTodoStore({ filePath: reloadPath });
  store.add('加载前');
  writeFileSync(reloadPath, 'not-json', 'utf8');
  const reloadBefore = readBytes(reloadPath);
  assert.throws(
    () => store.reload(),
    (error) =>
      error instanceof Error &&
      error.message.includes(reloadPath) &&
      error.message.includes('损坏')
  );
  assert.deepEqual(store.list(), [
    { id: 1, title: '加载前', completed: false },
  ]);
  assert.deepEqual(readBytes(reloadPath), reloadBefore);
});

test('生命周期回归：所有文件测试使用独立临时目录且不遗留文件', (t) => {
  const dirA = makeTempDir(t);
  const dirB = makeTempDir(t);
  assert.notEqual(dirA, dirB);

  const storeA = createTodoStore({ filePath: path.join(dirA, 'a.json') });
  const storeB = createTodoStore({ filePath: path.join(dirB, 'b.json') });
  storeA.add('A');
  storeB.add('B');
  storeB.add('B2');

  assert.deepEqual(storeA.list(), [{ id: 1, title: 'A', completed: false }]);
  assert.deepEqual(storeB.list(), [
    { id: 1, title: 'B', completed: false },
    { id: 2, title: 'B2', completed: false },
  ]);
  assert.deepEqual(readdirSync(dirA), ['a.json']);
  assert.deepEqual(readdirSync(dirB), ['b.json']);
});
