import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
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
