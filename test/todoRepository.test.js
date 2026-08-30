import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createTodoRepository } from '../src/todoRepository.js';

function tempFilePath() {
  const dir = mkdtempSync(join(tmpdir(), 'todo-repo-'));
  return join(dir, 'nested', 'deep', 'todos.json');
}

test('空仓库 list 返回空数组', () => {
  const repository = createTodoRepository(tempFilePath());

  assert.deepEqual(repository.list(), []);
});

test('首次调用仓库后自动创建嵌套父目录和有效 JSON 数据文件', () => {
  const filePath = tempFilePath();
  const repository = createTodoRepository(filePath);

  assert.equal(existsSync(filePath), false);

  repository.list();

  assert.equal(existsSync(filePath), true);
  const raw = JSON.parse(readFileSync(filePath, 'utf8'));
  assert.ok(Array.isArray(raw.todos));
});

test('add 创建任务，首个 ID 为 1，list 按 ID 升序返回任务', () => {
  const repository = createTodoRepository(tempFilePath());

  const first = repository.add('写测试');
  const second = repository.add('补实现');

  assert.deepEqual(first, { id: 1, title: '写测试', completed: false });
  assert.deepEqual(second, { id: 2, title: '补实现', completed: false });
  assert.deepEqual(repository.list(), [first, second]);
});

test('list 返回数组副本，外部修改不影响后续 list 结果', () => {
  const repository = createTodoRepository(tempFilePath());
  repository.add('保留状态');

  const snapshot = repository.list();
  snapshot.push({ id: 999, title: '外部注入', completed: false });
  snapshot[0].title = '被外部篡改';

  assert.deepEqual(repository.list(), [
    { id: 1, title: '保留状态', completed: false },
  ]);
});

test('不同数据文件路径的仓库互不影响', () => {
  const first = createTodoRepository(tempFilePath());
  const second = createTodoRepository(tempFilePath());

  first.add('只在第一个仓库');

  assert.equal(first.list().length, 1);
  assert.deepEqual(second.list(), []);
});

test('complete 将任务标记为已完成并返回更新后的任务', () => {
  const repository = createTodoRepository(tempFilePath());
  repository.add('待完成任务');

  const completed = repository.complete(1);

  assert.deepEqual(completed, { id: 1, title: '待完成任务', completed: true });
  assert.deepEqual(repository.list(), [completed]);
});

test('remove 删除任务并返回被删除的任务', () => {
  const repository = createTodoRepository(tempFilePath());
  repository.add('第一个');
  repository.add('第二个');

  const removed = repository.remove(1);

  assert.deepEqual(removed, { id: 1, title: '第一个', completed: false });
  assert.deepEqual(repository.list(), [
    { id: 2, title: '第二个', completed: false },
  ]);
});

test('同一文件路径的新实例可读取最新任务和完成状态', () => {
  const filePath = tempFilePath();
  const writer = createTodoRepository(filePath);
  writer.add('跨实例任务');
  writer.complete(1);

  const reader = createTodoRepository(filePath);

  assert.deepEqual(reader.list(), [
    { id: 1, title: '跨实例任务', completed: true },
  ]);
});

test('删除任务后 ID 不复用，新增任务获得更大的未使用 ID', () => {
  const repository = createTodoRepository(tempFilePath());
  repository.add('任务一');
  repository.add('任务二');
  repository.remove(2);

  const added = repository.add('任务三');

  assert.equal(added.id, 3);
  assert.deepEqual(
    repository.list().map((todo) => todo.id),
    [1, 3],
  );
});

test('complete 和 remove 后的状态持久化，ID 计数在多实例间隔离推进', () => {
  const filePath = tempFilePath();
  const first = createTodoRepository(filePath);
  first.add('共享文件任务');
  first.remove(1);

  const second = createTodoRepository(filePath);
  const added = second.add('新实例新增');

  assert.equal(added.id, 2);

  const other = createTodoRepository(tempFilePath());
  const isolated = other.add('隔离文件任务');

  assert.equal(isolated.id, 1);
});

test('add 对非字符串、空字符串和纯空白标题抛出 TypeError，已有数据不被破坏', () => {
  const filePath = tempFilePath();
  const repository = createTodoRepository(filePath);
  repository.add('已有任务');
  const before = readFileSync(filePath, 'utf8');

  for (const invalid of [undefined, null, 42, {}, [], '', '   ', '\t\n ']) {
    assert.throws(() => repository.add(invalid), TypeError);
  }

  assert.equal(readFileSync(filePath, 'utf8'), before);
  assert.deepEqual(repository.list(), [
    { id: 1, title: '已有任务', completed: false },
  ]);
});

test('complete 和 remove 对非数字、小数、零及负数 ID 抛出 TypeError', () => {
  const repository = createTodoRepository(tempFilePath());
  repository.add('目标任务');

  for (const invalid of [undefined, null, 'abc', '1', NaN, Infinity, 1.5, 0, -1]) {
    assert.throws(() => repository.complete(invalid), TypeError);
    assert.throws(() => repository.remove(invalid), TypeError);
  }

  assert.deepEqual(repository.list(), [
    { id: 1, title: '目标任务', completed: false },
  ]);
});

test('complete 和 remove 对不存在但格式合法的 ID 抛出 RangeError，JSON 数据保持不变', () => {
  const filePath = tempFilePath();
  const repository = createTodoRepository(filePath);
  repository.add('保留任务');
  const before = readFileSync(filePath, 'utf8');

  assert.throws(() => repository.complete(99), RangeError);
  assert.throws(() => repository.remove(99), RangeError);

  assert.equal(readFileSync(filePath, 'utf8'), before);
  assert.deepEqual(repository.list(), [
    { id: 1, title: '保留任务', completed: false },
  ]);
});

test('读取无法解析的 JSON 数据文件时抛出清晰错误，文件内容不被覆盖或重置', () => {
  const dir = mkdtempSync(join(tmpdir(), 'todo-repo-corrupt-'));
  const corruptPath = join(dir, 'todos.json');
  writeFileSync(corruptPath, '{ 这不是合法 JSON', 'utf8');

  const repository = createTodoRepository(corruptPath);

  assert.throws(() => repository.list(), /JSON/);
  assert.throws(() => repository.add('新任务'), /JSON/);

  assert.equal(readFileSync(corruptPath, 'utf8'), '{ 这不是合法 JSON');
});
