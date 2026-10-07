import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createTodoStore } from '../src/todoStore.js';

function makeTempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'todo-store-'));
  t.after(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

test('createTodoStore({ filePath }) 自动创建多级目录和有效 JSON 文件，初始列表为空', (t) => {
  const dir = makeTempDir(t);
  const filePath = join(dir, 'nested', 'deep', 'todos.json');

  const store = createTodoStore({ filePath });

  assert.equal(existsSync(filePath), true);
  assert.deepEqual(store.list(), []);
  const raw = JSON.parse(readFileSync(filePath, 'utf8'));
  assert.deepEqual(raw, { todos: [], nextId: 1 });
});

test('无参数内存模式不创建任何数据文件', (t) => {
  const dir = makeTempDir(t);
  const cwd = process.cwd();
  process.chdir(dir);
  t.after(() => {
    process.chdir(cwd);
  });

  const store = createTodoStore();
  store.add('内存任务');

  assert.equal(existsSync(join(dir, 'todos.json')), false);
  const remaining = readdirSafe(dir);
  assert.deepEqual(remaining, []);
});

function readdirSafe(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

test('持久化模式下 CRUD 同步保存，重新创建同路径实例可恢复状态', (t) => {
  const dir = makeTempDir(t);
  const filePath = join(dir, 'todos.json');

  const store = createTodoStore({ filePath });
  const added = store.add('买菜');
  store.add('健身');
  store.complete(added.id);
  store.remove(2);

  const restored = createTodoStore({ filePath });
  assert.deepEqual(restored.list(), [
    { id: 1, title: '买菜', completed: true },
  ]);
});

test('JSON 文件保存 Todo 列表和下一可用 ID', (t) => {
  const dir = makeTempDir(t);
  const filePath = join(dir, 'todos.json');

  const store = createTodoStore({ filePath });
  store.add('任务一');
  store.add('任务二');

  const raw = JSON.parse(readFileSync(filePath, 'utf8'));
  assert.equal(raw.nextId, 3);
  assert.deepEqual(raw.todos, [
    { id: 1, title: '任务一', completed: false },
    { id: 2, title: '任务二', completed: false },
  ]);
});

test('删除最高 ID 后重新创建实例，新增 ID 仍递增且不复用', (t) => {
  const dir = makeTempDir(t);
  const filePath = join(dir, 'todos.json');

  const store = createTodoStore({ filePath });
  store.add('甲');
  store.add('乙');
  store.remove(2);

  const restored = createTodoStore({ filePath });
  const next = restored.add('丙');

  assert.equal(next.id, 3);
});

test('删除全部任务后重新创建实例，新增 ID 仍递增且不复用', (t) => {
  const dir = makeTempDir(t);
  const filePath = join(dir, 'todos.json');

  const store = createTodoStore({ filePath });
  store.add('甲');
  store.add('乙');
  store.remove(1);
  store.remove(2);
  assert.deepEqual(store.list(), []);

  const restored = createTodoStore({ filePath });
  assert.deepEqual(restored.list(), []);
  const next = restored.add('重启');
  assert.equal(next.id, 3);
});
