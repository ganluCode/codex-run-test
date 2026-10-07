import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

test('createTodoStore({ filePath }) 自动创建多级父目录和有效 JSON 文件，初始列表为空', (t) => {
  const dir = makeTempDir(t);
  const filePath = join(dir, 'nested', 'deep', 'todos.json');

  const store = createTodoStore({ filePath });

  assert.equal(existsSync(filePath), true);
  const data = JSON.parse(readFileSync(filePath, 'utf8'));
  assert.deepEqual(data.todos, []);
  assert.equal(typeof data.nextId, 'number');
  assert.deepEqual(store.list(), []);
});

test('无参数内存模式不创建任何数据文件且行为不变', (t) => {
  const dir = makeTempDir(t);
  const before = new Set(existsSync(dir) ? readDirNames(dir) : []);

  const store = createTodoStore();
  store.add('内存任务');

  assert.deepEqual(store.list(), store.list());
  assert.deepEqual(store.list(), [{ id: 1, title: '内存任务', completed: false }]);
  assert.deepEqual(new Set(readDirNames(dir)), before);
});

function readDirNames(dir) {
  return readdirSync(dir);
}

import { readdirSync } from 'node:fs';

test('持久化模式 CRUD 后同步保存，重新创建同路径实例可恢复数据', (t) => {
  const dir = makeTempDir(t);
  const filePath = join(dir, 'todos.json');

  const store = createTodoStore({ filePath });
  const added = store.add('买菜');
  store.add('写周报');
  store.complete(added.id);
  store.remove(2);

  assert.deepEqual(store.list(), [
    { id: 1, title: '买菜', completed: true },
  ]);

  const restored = createTodoStore({ filePath });
  assert.deepEqual(restored.list(), [
    { id: 1, title: '买菜', completed: true },
  ]);

  const removed = restored.remove(1);
  assert.deepEqual(removed, { id: 1, title: '买菜', completed: true });

  const again = createTodoStore({ filePath });
  assert.deepEqual(again.list(), []);
});

test('删除最高 ID 后重新创建实例，新增 ID 仍递增且不复用', (t) => {
  const dir = makeTempDir(t);
  const filePath = join(dir, 'todos.json');

  const store = createTodoStore({ filePath });
  store.add('一');
  store.add('二');
  store.add('三');
  store.remove(3);

  const restored = createTodoStore({ filePath });
  const next = restored.add('四');
  assert.equal(next.id, 4);
});

test('删除全部任务后重新创建实例，新增 ID 仍递增且不复用', (t) => {
  const dir = makeTempDir(t);
  const filePath = join(dir, 'todos.json');

  const store = createTodoStore({ filePath });
  store.add('一');
  store.add('二');
  store.remove(1);
  store.remove(2);

  const restored = createTodoStore({ filePath });
  const next = restored.add('三');
  assert.equal(next.id, 3);
});

test('旧实例 reload() 后在本实例继续新增，删除最高 ID 与删除全部任务均不复用已分配 ID', (t) => {
  const dir = makeTempDir(t);
  const filePath = join(dir, 'todos.json');

  const storeA = createTodoStore({ filePath });
  storeA.add('一');
  storeA.add('二');
  storeA.add('三');

  const storeB = createTodoStore({ filePath });
  storeB.remove(3);

  storeA.reload();
  assert.deepEqual(storeA.list(), [
    { id: 1, title: '一', completed: false },
    { id: 2, title: '二', completed: false },
  ]);
  const next = storeA.add('四');
  assert.equal(next.id, 4);
  assert.equal(next.title, '四');
  assert.equal(next.completed, false);

  const storeC = createTodoStore({ filePath });
  for (const item of storeC.list()) {
    storeC.remove(item.id);
  }

  storeA.reload();
  assert.deepEqual(storeA.list(), []);
  const afterPurge = storeA.add('五');
  assert.equal(afterPurge.id, 5);

  const restored = createTodoStore({ filePath });
  assert.deepEqual(restored.list(), [
    { id: 5, title: '五', completed: false },
  ]);
});

test('JSON 文件保存 Todo 列表和下一可用 ID', (t) => {
  const dir = makeTempDir(t);
  const filePath = join(dir, 'todos.json');

  const store = createTodoStore({ filePath });
  store.add('任务 A');
  store.add('任务 B');

  const data = JSON.parse(readFileSync(filePath, 'utf8'));
  assert.deepEqual(data.todos, [
    { id: 1, title: '任务 A', completed: false },
    { id: 2, title: '任务 B', completed: false },
  ]);
  assert.equal(data.nextId, 3);
});

test('reload() 反映另一实例的最新写入并恢复下一可用 ID', (t) => {
  const dir = makeTempDir(t);
  const filePath = join(dir, 'todos.json');

  const storeA = createTodoStore({ filePath });
  storeA.add('旧任务');
  const storeB = createTodoStore({ filePath });
  const added = storeB.add('新任务');
  storeB.complete(added.id);

  assert.deepEqual(storeA.list(), [{ id: 1, title: '旧任务', completed: false }]);
  storeA.reload();
  assert.deepEqual(storeA.list(), [
    { id: 1, title: '旧任务', completed: false },
    { id: 2, title: '新任务', completed: true },
  ]);
  const next = storeA.add('第三个');
  assert.equal(next.id, 3);
});

test('reload() 反映另一实例的删除并恢复下一可用 ID', (t) => {
  const dir = makeTempDir(t);
  const filePath = join(dir, 'todos.json');

  const storeA = createTodoStore({ filePath });
  storeA.add('一');
  storeA.add('二');

  const storeB = createTodoStore({ filePath });
  storeB.remove(1);

  storeA.reload();
  assert.deepEqual(storeA.list(), [{ id: 2, title: '二', completed: false }]);
  const next = storeA.add('三');
  assert.equal(next.id, 3);
});

test('构造实例遇到损坏 JSON 时抛出包含路径和原因的错误，且原文件不变', (t) => {
  const dir = makeTempDir(t);
  const filePath = join(dir, 'todos.json');
  const raw = '{ "todos": [ broken json';
  writeFileSync(filePath, raw, 'utf8');

  assert.throws(
    () => createTodoStore({ filePath }),
    (error) => error instanceof Error
      && error.message.includes(filePath)
      && error.message.includes('JSON'),
  );
  assert.equal(readFileSync(filePath, 'utf8'), raw);
});

test('reload() 遇到损坏 JSON 时抛出错误且原实例状态与文件均不变', (t) => {
  const dir = makeTempDir(t);
  const filePath = join(dir, 'todos.json');

  const store = createTodoStore({ filePath });
  store.add('保留我');

  const raw = 'not json at all';
  writeFileSync(filePath, raw, 'utf8');

  assert.throws(
    () => store.reload(),
    (error) => error instanceof Error && error.message.includes(filePath),
  );
  assert.deepEqual(store.list(), [{ id: 1, title: '保留我', completed: false }]);
  const next = store.add('新增依旧可用');
  assert.equal(next.id, 2);
  assert.equal(readFileSync(filePath, 'utf8') === raw, false);
  const data = JSON.parse(readFileSync(filePath, 'utf8'));
  assert.deepEqual(data.todos, [
    { id: 1, title: '保留我', completed: false },
    { id: 2, title: '新增依旧可用', completed: false },
  ]);
});

test('合法 JSON 但数据结构无效时报错且不覆盖原文件（重复 ID / nextId 冲突）', (t) => {
  const dir = makeTempDir(t);
  const filePath = join(dir, 'todos.json');

  const duplicate = JSON.stringify({
    todos: [
      { id: 1, title: '一', completed: false },
      { id: 1, title: '重复', completed: true },
    ],
    nextId: 2,
  });
  writeFileSync(filePath, duplicate, 'utf8');
  assert.throws(
    () => createTodoStore({ filePath }),
    (error) => error.message.includes('重复') || error.message.includes('nextId'),
  );
  assert.equal(readFileSync(filePath, 'utf8'), duplicate);

  const conflict = JSON.stringify({
    todos: [{ id: 5, title: '五', completed: false }],
    nextId: 3,
  });
  writeFileSync(filePath, conflict, 'utf8');
  assert.throws(() => createTodoStore({ filePath }), /nextId/);
  assert.equal(readFileSync(filePath, 'utf8'), conflict);
});

test('合法 JSON 但 todo 字段非法时报错且不覆盖原文件', (t) => {
  const dir = makeTempDir(t);
  const filePath = join(dir, 'todos.json');

  const badTitle = JSON.stringify({
    todos: [{ id: 1, title: '  ', completed: false }],
    nextId: 2,
  });
  writeFileSync(filePath, badTitle, 'utf8');
  assert.throws(() => createTodoStore({ filePath }), /title/);
  assert.equal(readFileSync(filePath, 'utf8'), badTitle);

  const badCompleted = JSON.stringify({
    todos: [{ id: 1, title: '一', completed: 'yes' }],
    nextId: 2,
  });
  writeFileSync(filePath, badCompleted, 'utf8');
  assert.throws(() => createTodoStore({ filePath }), /completed/);
  assert.equal(readFileSync(filePath, 'utf8'), badCompleted);
});

test('complete/remove 拒绝非正或非安全整数 ID 并抛出 TypeError，且不改变列表与文件', (t) => {
  const dir = makeTempDir(t);
  const filePath = join(dir, 'todos.json');

  const store = createTodoStore({ filePath });
  store.add('任务');
  const before = readFileSync(filePath, 'utf8');

  for (const badId of [0, -1, 1.5, Number.NaN, '1', null, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => store.complete(badId), TypeError);
    assert.throws(() => store.remove(badId), TypeError);
  }
  assert.deepEqual(store.list(), [{ id: 1, title: '任务', completed: false }]);
  assert.equal(readFileSync(filePath, 'utf8'), before);

  assert.throws(() => store.complete(99), RangeError);
  assert.throws(() => store.remove(99), RangeError);
  assert.equal(readFileSync(filePath, 'utf8'), before);
});

test('add 拒绝空字符串、纯空白和非字符串标题并抛出 TypeError，且不改变文件', (t) => {
  const dir = makeTempDir(t);
  const filePath = join(dir, 'todos.json');

  const store = createTodoStore({ filePath });
  const before = readFileSync(filePath, 'utf8');

  for (const badTitle of ['', '   ', null, undefined, 123, {}]) {
    assert.throws(() => store.add(badTitle), TypeError);
  }
  assert.deepEqual(store.list(), []);
  assert.equal(readFileSync(filePath, 'utf8'), before);
});
