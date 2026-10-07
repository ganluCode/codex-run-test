import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createTodoStore } from '../src/todoStore.js';

function makeTempDir(t) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'todo-store-f002-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function readBytes(filePath) {
  return readFileSync(filePath);
}

// ---------- reload() ----------

test('reload() 反映另一实例的新增、完成和删除，并恢复下一可用 ID', (t) => {
  const dir = makeTempDir(t);
  const filePath = path.join(dir, 'todos.json');

  const first = createTodoStore({ filePath });
  const second = createTodoStore({ filePath });

  const added = second.add('写实现');
  second.add('写测试');
  second.complete(added.id);
  second.remove(2);

  first.reload();

  assert.deepEqual(first.list(), [
    { id: 1, title: '写实现', completed: true },
  ]);
  // nextId 恢复为 3，继续新增不冲突
  const next = first.add('接着做');
  assert.equal(next.id, 3);
});

test('内存模式 reload() 为空操作，不影响既有数据', () => {
  const store = createTodoStore();
  store.add('内存任务');

  assert.doesNotThrow(() => store.reload());
  assert.deepEqual(store.list(), [
    { id: 1, title: '内存任务', completed: false },
  ]);
});

// ---------- ID 输入校验 ----------

test('complete/remove 拒绝非正安全整数 ID 并抛出 TypeError', (t) => {
  const dir = makeTempDir(t);
  const store = createTodoStore({ filePath: path.join(dir, 'todos.json') });
  store.add('任务');

  for (const badId of [0, -1, 1.5, NaN, '1', null, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => store.complete(badId), TypeError);
    assert.throws(() => store.remove(badId), TypeError);
  }
});

test('complete/remove 对合法但不存在的 ID 抛出 RangeError', (t) => {
  const dir = makeTempDir(t);
  const store = createTodoStore({ filePath: path.join(dir, 'todos.json') });
  store.add('任务');

  assert.throws(() => store.complete(99), RangeError);
  assert.throws(() => store.remove(99), RangeError);
});

test('无效的 add/complete/remove 不改变列表、下一可用 ID 或持久化文件', (t) => {
  const dir = makeTempDir(t);
  const filePath = path.join(dir, 'todos.json');
  const store = createTodoStore({ filePath });
  store.add('有效任务');

  const beforeTodos = store.list().map((item) => ({ ...item }));
  const beforeBytes = readBytes(filePath);

  assert.throws(() => store.add('   '), TypeError);
  assert.throws(() => store.add(123), TypeError);
  assert.throws(() => store.complete(0), TypeError);
  assert.throws(() => store.remove(-5), TypeError);
  assert.throws(() => store.complete(42), RangeError);
  assert.throws(() => store.remove(42), RangeError);

  assert.deepEqual(store.list(), beforeTodos);
  assert.deepEqual(readBytes(filePath), beforeBytes);
  // 下一可用 ID 未前进：新增仍复用未分配的 2
  const next = store.add('下一个');
  assert.equal(next.id, 2);
});

// ---------- 损坏 JSON ----------

test('构造实例遇到损坏 JSON 时抛出包含路径和原因的明确错误，文件字节不变', (t) => {
  const dir = makeTempDir(t);
  const filePath = path.join(dir, 'todos.json');
  writeFileSync(filePath, '{ "todos": [', 'utf8');
  const beforeBytes = readBytes(filePath);

  assert.throws(
    () => createTodoStore({ filePath }),
    (error) =>
      error instanceof Error &&
      error.message.includes(filePath) &&
      error.message.includes('损坏')
  );
  assert.deepEqual(readBytes(filePath), beforeBytes);
});

test('reload() 遇到损坏 JSON 时抛出错误，实例保留加载前状态，文件字节不变', (t) => {
  const dir = makeTempDir(t);
  const filePath = path.join(dir, 'todos.json');
  const store = createTodoStore({ filePath });
  store.add('加载前的任务');

  writeFileSync(filePath, 'not-json-at-all', 'utf8');
  const corruptedBytes = readBytes(filePath);

  assert.throws(
    () => store.reload(),
    (error) =>
      error instanceof Error &&
      error.message.includes(filePath) &&
      error.message.includes('损坏')
  );
  assert.deepEqual(store.list(), [
    { id: 1, title: '加载前的任务', completed: false },
  ]);
  // 下一可用 ID 未变：新增仍是 2
  const next = store.add('加载后新增');
  assert.equal(next.id, 2);
});

// ---------- 合法 JSON 但结构无效 ----------

function writeState(filePath, state) {
  writeFileSync(filePath, JSON.stringify(state), 'utf8');
}

const invalidStates = [
  ['根节点非对象', '[]'],
  ['todos 非数组', { todos: {}, nextId: 1 }],
  ['todo id 非法', { todos: [{ id: 0, title: 'x', completed: false }], nextId: 1 }],
  ['todo title 非法', { todos: [{ id: 1, title: '  ', completed: false }], nextId: 2 }],
  ['todo completed 非法', { todos: [{ id: 1, title: 'x', completed: 'yes' }], nextId: 2 }],
  [
    'todo id 重复',
    {
      todos: [
        { id: 1, title: 'a', completed: false },
        { id: 1, title: 'b', completed: true },
      ],
      nextId: 2,
    },
  ],
  ['nextId 缺失', { todos: [{ id: 1, title: 'x', completed: false }] }],
  ['nextId 非整数', { todos: [], nextId: 1.5 }],
  [
    'nextId 与已有 id 冲突',
    { todos: [{ id: 5, title: 'x', completed: false }], nextId: 3 },
  ],
];

for (const [label, state] of invalidStates) {
  test(`构造实例拒绝结构无效的数据（${label}），明确报错且文件不被覆盖`, (t) => {
    const dir = makeTempDir(t);
    const filePath = path.join(dir, 'todos.json');
    writeState(filePath, state);
    const beforeBytes = readBytes(filePath);

    assert.throws(
      () => createTodoStore({ filePath }),
      (error) =>
        error instanceof Error &&
        error.message.includes(filePath) &&
        error.message.includes('结构无效')
    );
    assert.deepEqual(readBytes(filePath), beforeBytes);
  });
}

for (const [label, state] of invalidStates) {
  test(`reload() 拒绝结构无效的数据（${label}），实例保留加载前状态`, (t) => {
    const dir = makeTempDir(t);
    const filePath = path.join(dir, 'todos.json');
    const store = createTodoStore({ filePath });
    store.add('加载前的任务');
    writeState(filePath, state);

    assert.throws(() => store.reload(), /结构无效/);
    assert.deepEqual(store.list(), [
      { id: 1, title: '加载前的任务', completed: false },
    ]);
  });
}

test('有效但含多余字段的数据可被恢复，且只保留规范字段', (t) => {
  const dir = makeTempDir(t);
  const filePath = path.join(dir, 'todos.json');
  writeFileSync(
    filePath,
    JSON.stringify({
      todos: [{ id: 2, title: '任务', completed: true, extra: '忽略' }],
      nextId: 3,
      other: '忽略',
    }),
    'utf8'
  );

  const store = createTodoStore({ filePath });
  assert.deepEqual(store.list(), [{ id: 2, title: '任务', completed: true }]);
});
