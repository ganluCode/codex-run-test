import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createTodoStore } from '../src/todoStore.js';

function makeTempDir(t) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'todo-store-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('createTodoStore({ filePath }) 在文件与多级目录不存在时自动创建目录和有效 JSON 文件', (t) => {
  const dir = makeTempDir(t);
  const filePath = path.join(dir, 'nested', 'deep', 'todos.json');

  assert.equal(existsSync(filePath), false);
  const store = createTodoStore({ filePath });

  assert.equal(existsSync(filePath), true);
  const raw = JSON.parse(readFileSync(filePath, 'utf8'));
  assert.deepEqual(raw.todos, []);
  assert.equal(raw.nextId, 1);
  assert.deepEqual(store.list(), []);
});

test('无参数内存模式保持原有行为且不创建任何数据文件', (t) => {
  const dir = makeTempDir(t);

  const store = createTodoStore();
  store.add('内存任务');

  assert.deepEqual(store.list(), [
    { id: 1, title: '内存任务', completed: false },
  ]);
  // 内存模式不应在文件系统中创建任何数据文件
  assert.deepEqual(readdirSync(dir), []);
});

test('持久化模式下 add、complete、remove 同步保存，跨实例可完整恢复', (t) => {
  const dir = makeTempDir(t);
  const filePath = path.join(dir, 'todos.json');

  const store = createTodoStore({ filePath });
  const added = store.add('写实现');
  store.add('写测试');
  store.complete(added.id);
  store.remove(2);

  // 新实例从同一文件恢复 id、title、completed 及删除结果
  const restored = createTodoStore({ filePath });
  assert.deepEqual(restored.list(), [
    { id: 1, title: '写实现', completed: true },
  ]);

  const raw = JSON.parse(readFileSync(filePath, 'utf8'));
  assert.deepEqual(raw.todos, [{ id: 1, title: '写实现', completed: true }]);
  assert.equal(raw.nextId, 3);
});

test('删除最高 ID 后重新创建实例，新增 ID 仍递增且不复用已分配 ID', (t) => {
  const dir = makeTempDir(t);
  const filePath = path.join(dir, 'todos.json');

  const store = createTodoStore({ filePath });
  store.add('一');
  store.add('二');
  store.remove(2);

  const restored = createTodoStore({ filePath });
  const next = restored.add('三');

  assert.equal(next.id, 3);
  assert.deepEqual(restored.list().map((item) => item.id), [1, 3]);
});

test('删除全部任务后重新创建实例，新增 ID 仍从已分配的下一 ID 继续', (t) => {
  const dir = makeTempDir(t);
  const filePath = path.join(dir, 'todos.json');

  const store = createTodoStore({ filePath });
  store.add('一');
  store.add('二');
  store.remove(1);
  store.remove(2);

  const restored = createTodoStore({ filePath });
  assert.deepEqual(restored.list(), []);
  const next = restored.add('重新开始');
  assert.equal(next.id, 3);
});

test('持久化模式不影响既有内存接口与实例隔离', (t) => {
  const dir = makeTempDir(t);
  const filePath = path.join(dir, 'todos.json');

  const persisted = createTodoStore({ filePath });
  const memory = createTodoStore();

  persisted.add('持久化任务');
  memory.add('内存任务');

  assert.deepEqual(persisted.list(), [
    { id: 1, title: '持久化任务', completed: false },
  ]);
  assert.deepEqual(memory.list(), [
    { id: 1, title: '内存任务', completed: false },
  ]);
});
