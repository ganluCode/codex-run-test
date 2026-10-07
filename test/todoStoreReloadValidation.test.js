import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createTodoStore } from '../src/todoStore.js';

function makeTempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'todo-reload-'));
  t.after(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

function makeFilePath(t, initialContent) {
  const dir = makeTempDir(t);
  const filePath = join(dir, 'data', 'todos.json');
  if (initialContent !== undefined) {
    mkdirFor(filePath);
    writeFileSync(filePath, initialContent, 'utf8');
  }
  return filePath;
}

function mkdirFor(filePath) {
  const dir = join(filePath, '..');
  mkdirSync(dir, { recursive: true });
}

import { mkdirSync } from 'node:fs';

test('reload() 反映另一实例保存的最新状态并恢复下一可用 ID', (t) => {
  const dir = makeTempDir(t);
  const filePath = join(dir, 'todos.json');

  const storeA = createTodoStore({ filePath });
  const storeB = createTodoStore({ filePath });

  const added = storeB.add('乙的任务');
  storeB.complete(added.id);

  storeA.reload();

  assert.deepEqual(storeA.list(), [
    { id: 1, title: '乙的任务', completed: true },
  ]);
  const next = storeA.add('甲的任务');
  assert.equal(next.id, 2);
});

test('reload() 反映另一实例的删除并恢复下一可用 ID', (t) => {
  const dir = makeTempDir(t);
  const filePath = join(dir, 'todos.json');

  const storeA = createTodoStore({ filePath });
  storeA.add('甲');
  storeA.add('乙');

  const storeB = createTodoStore({ filePath });
  storeB.remove(2);

  storeA.reload();
  assert.deepEqual(storeA.list(), [{ id: 1, title: '甲', completed: false }]);

  const next = storeA.add('丙');
  assert.equal(next.id, 3);
});

test('add 拒绝空字符串、纯空白和非字符串标题并抛出 TypeError', (t) => {
  const filePath = makeFilePath(t);
  const store = createTodoStore({ filePath });

  for (const badTitle of ['', '   ', 123, null, undefined, {}]) {
    assert.throws(() => store.add(badTitle), TypeError);
  }
  assert.deepEqual(store.list(), []);
  assert.equal(JSON.parse(readFileSync(filePath, 'utf8')).todos.length, 0);
});

test('complete/remove 拒绝非正安全整数 ID 抛出 TypeError，不存在 ID 抛出 RangeError', (t) => {
  const filePath = makeFilePath(t);
  const store = createTodoStore({ filePath });
  const added = store.add('任务');

  for (const badId of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1, '1']) {
    assert.throws(() => store.complete(badId), TypeError);
    assert.throws(() => store.remove(badId), TypeError);
  }
  assert.throws(() => store.complete(999), RangeError);
  assert.throws(() => store.remove(999), RangeError);

  assert.deepEqual(store.list(), [added]);
  assert.equal(JSON.parse(readFileSync(filePath, 'utf8')).todos.length, 1);
});

test('构造实例遇到损坏 JSON 抛出包含路径和原因的错误，原文件字节不变', (t) => {
  const filePath = makeFilePath(t, '{ broken json !!!');
  const before = readFileSync(filePath, 'utf8');

  assert.throws(
    () => createTodoStore({ filePath }),
    (error) =>
      error instanceof Error &&
      error.message.includes(filePath) &&
      error.message.includes('JSON'),
  );

  assert.equal(readFileSync(filePath, 'utf8'), before);
});

test('reload() 遇到损坏 JSON 抛出明确错误，实例状态与原文件字节均不变', (t) => {
  const filePath = makeFilePath(t);
  const store = createTodoStore({ filePath });
  store.add('原始任务');
  const beforeState = store.list();
  const beforeNext = JSON.parse(readFileSync(filePath, 'utf8')).nextId;

  writeFileSync(filePath, 'not json at all', 'utf8');
  const beforeBytes = readFileSync(filePath, 'utf8');

  assert.throws(
    () => store.reload(),
    (error) =>
      error instanceof Error &&
      error.message.includes(filePath) &&
      error.message.includes('JSON'),
  );

  assert.deepEqual(store.list(), beforeState);
  assert.equal(readFileSync(filePath, 'utf8'), beforeBytes);

  const next = store.add('继续新增');
  assert.equal(next.id, beforeNext);
});

test('合法 JSON 但数据结构无效时报错且不覆盖原文件', (t) => {
  const cases = [
    JSON.stringify({ todos: 'not-array', nextId: 1 }),
    JSON.stringify({ todos: [{ id: 'x', title: 'a', completed: false }], nextId: 2 }),
    JSON.stringify({ todos: [{ id: 1, title: '  ', completed: false }], nextId: 2 }),
    JSON.stringify({ todos: [{ id: 1, title: 'a', completed: 'no' }], nextId: 2 }),
    JSON.stringify({ todos: [{ id: 1, title: 'a', completed: false }, { id: 1, title: 'b', completed: false }], nextId: 2 }),
    JSON.stringify({ todos: [{ id: 1, title: 'a', completed: false }], nextId: 1 }),
    JSON.stringify({ todos: [{ id: 1, title: 'a', completed: false }] }),
  ];

  for (const content of cases) {
    const filePath = makeFilePath(t, content);
    const before = readFileSync(filePath, 'utf8');
    assert.throws(
      () => createTodoStore({ filePath }),
      (error) => error instanceof Error && error.message.includes(filePath),
    );
    assert.equal(readFileSync(filePath, 'utf8'), before);
  }
});

test('有效数据通过校验：nextId 大于最大已用 ID 时可正常恢复', (t) => {
  const filePath = makeFilePath(
    t,
    JSON.stringify({
      todos: [{ id: 5, title: '老任务', completed: true }],
      nextId: 6,
    }),
  );

  const store = createTodoStore({ filePath });
  assert.deepEqual(store.list(), [{ id: 5, title: '老任务', completed: true }]);
  const next = store.add('新任务');
  assert.equal(next.id, 6);
});

test('无效 add/complete/remove 不改变列表、下一可用 ID 或持久化文件', (t) => {
  const filePath = makeFilePath(t);
  const store = createTodoStore({ filePath });
  store.add('任务一');
  const beforeBytes = readFileSync(filePath, 'utf8');
  const beforeState = store.list();
  const beforeNextId = JSON.parse(beforeBytes).nextId;

  assert.throws(() => store.add(''), TypeError);
  assert.throws(() => store.complete(0), TypeError);
  assert.throws(() => store.remove(999), RangeError);

  assert.deepEqual(store.list(), beforeState);
  assert.equal(JSON.parse(readFileSync(filePath, 'utf8')).nextId, beforeNextId);
  assert.equal(readFileSync(filePath, 'utf8'), beforeBytes);
});
