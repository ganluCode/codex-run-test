import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createTodoStore } from '../src/todoStore.js';

// 每个测试使用独立临时目录，结束后递归清理，避免污染真实用户数据或遗留文件。
function makeTempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'todo-lifecycle-'));
  t.after(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

test('生命周期回归：嵌套目录首次初始化后 CRUD，跨实例恢复完整字段', (t) => {
  const dir = makeTempDir(t);
  const filePath = join(dir, 'data', 'deep', 'todos.json');

  const store = createTodoStore({ filePath });
  assert.deepEqual(store.list(), []);

  const shopping = store.add('买菜');
  const gym = store.add('健身');
  store.complete(shopping.id);
  store.remove(gym.id);

  assert.deepEqual(store.list(), [
    { id: 1, title: '买菜', completed: true },
  ]);

  const restored = createTodoStore({ filePath });
  assert.deepEqual(restored.list(), [
    { id: 1, title: '买菜', completed: true },
  ]);

  const raw = JSON.parse(readFileSync(filePath, 'utf8'));
  assert.deepEqual(raw, {
    todos: [{ id: 1, title: '买菜', completed: true }],
    nextId: 3,
  });
});

test('生命周期回归：旧实例 reload() 同步另一实例的新增、完成与删除', (t) => {
  const dir = makeTempDir(t);
  const filePath = join(dir, 'todos.json');

  const older = createTodoStore({ filePath });
  const newer = createTodoStore({ filePath });

  const first = newer.add('甲');
  const second = newer.add('乙');
  newer.complete(first.id);
  newer.remove(second.id);

  older.reload();

  assert.deepEqual(older.list(), [
    { id: 1, title: '甲', completed: true },
  ]);

  const third = older.add('丙');
  assert.deepEqual(third, { id: 3, title: '丙', completed: false });
});

test('生命周期回归：删除最高 ID 后重建实例与 reload() 继续新增均不复用 ID', (t) => {
  const dir = makeTempDir(t);
  const filePath = join(dir, 'todos.json');

  const store = createTodoStore({ filePath });
  store.add('甲');
  store.add('乙');
  store.remove(2);

  const restored = createTodoStore({ filePath });
  assert.deepEqual(restored.add('丙'), { id: 3, title: '丙', completed: false });

  const reloaded = createTodoStore({ filePath });
  reloaded.reload();
  assert.deepEqual(reloaded.add('丁'), { id: 4, title: '丁', completed: false });
});

test('生命周期回归：删除全部任务后 reload() 继续新增仍不复用已分配 ID', (t) => {
  const dir = makeTempDir(t);
  const filePath = join(dir, 'todos.json');

  const store = createTodoStore({ filePath });
  store.add('甲');
  store.add('乙');
  store.remove(1);
  store.remove(2);
  assert.deepEqual(store.list(), []);

  store.reload();
  assert.deepEqual(store.list(), []);
  assert.deepEqual(store.add('重启'), { id: 3, title: '重启', completed: false });

  const restored = createTodoStore({ filePath });
  assert.deepEqual(restored.add('再接'), { id: 4, title: '再接', completed: false });
});

test('生命周期回归：损坏 JSON 的构造与 reload 均失败且保留原文件', (t) => {
  const dir = makeTempDir(t);
  const filePath = join(dir, 'todos.json');

  const store = createTodoStore({ filePath });
  store.add('原始任务');
  const originalBytes = readFileSync(filePath, 'utf8');
  const originalState = store.list();

  writeFileSync(filePath, '{ 损坏的 JSON', 'utf8');
  const brokenBytes = readFileSync(filePath, 'utf8');

  assert.throws(
    () => createTodoStore({ filePath }),
    (error) => error instanceof Error && error.message.includes(filePath),
  );
  assert.equal(readFileSync(filePath, 'utf8'), brokenBytes);

  assert.throws(
    () => store.reload(),
    (error) => error instanceof Error && error.message.includes(filePath),
  );
  assert.deepEqual(store.list(), originalState);
  assert.equal(readFileSync(filePath, 'utf8'), brokenBytes);

  // 恢复为合法内容后，reload() 可正常恢复最初保存的状态。
  writeFileSync(filePath, originalBytes, 'utf8');
  store.reload();
  assert.deepEqual(store.list(), originalState);
});
