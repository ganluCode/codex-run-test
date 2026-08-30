import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { DEFAULT_DATA_FILE } from '../src/cli.js';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const cliEntry = join(projectRoot, 'src', 'cli.js');

// 端到端测试统一通过 TODO_DATA_FILE 注入隔离的临时数据文件，不污染项目默认 JSON 数据文件。
function tempDataFile() {
  const dir = mkdtempSync(join(tmpdir(), 'todo-cli-e2e-'));
  return join(dir, 'todos.json');
}

// 以真实子进程执行 CLI 入口，返回退出码与 stdout / stderr 内容。
function runCliProcess(args, dataFile) {
  const result = spawnSync(process.execPath, [cliEntry, ...args], {
    cwd: projectRoot,
    env: { ...process.env, TODO_DATA_FILE: dataFile },
    encoding: 'utf8',
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

test('端到端: add / list / complete / remove 全流程跨进程读写同一数据文件', () => {
  const dataFile = tempDataFile();

  // add 两个任务
  const first = runCliProcess(['add', '任务甲'], dataFile);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(first.stderr, '');
  assert.match(first.stdout, /#1 \[未完成\] 任务甲/);

  const second = runCliProcess(['add', '任务乙'], dataFile);
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /#2 \[未完成\] 任务乙/);

  // complete 第一个任务
  const complete = runCliProcess(['complete', '1'], dataFile);
  assert.equal(complete.status, 0, complete.stderr);
  assert.match(complete.stdout, /#1 \[已完成\] 任务甲/);

  // list 显示两个任务及各自状态
  const list = runCliProcess(['list'], dataFile);
  assert.equal(list.status, 0, list.stderr);
  assert.equal(list.stderr, '');
  const lines = list.stdout.trim().split('\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /#1 \[已完成\] 任务甲/);
  assert.match(lines[1], /#2 \[未完成\] 任务乙/);

  // remove 第二个任务
  const remove = runCliProcess(['remove', '2'], dataFile);
  assert.equal(remove.status, 0, remove.stderr);
  assert.match(remove.stdout, /已删除 #2 \[未完成\] 任务乙/);

  // 再次 list 只剩已完成的第一条
  const finalList = runCliProcess(['list'], dataFile);
  assert.equal(finalList.status, 0, finalList.stderr);
  const finalLines = finalList.stdout.trim().split('\n');
  assert.equal(finalLines.length, 1);
  assert.match(finalLines[0], /#1 \[已完成\] 任务甲/);

  // 数据文件落盘内容与 CLI 行为一致
  const raw = JSON.parse(readFileSync(dataFile, 'utf8'));
  assert.equal(raw.todos.length, 1);
  assert.deepEqual(raw.todos[0], { id: 1, title: '任务甲', completed: true });
});

test('端到端: 空列表输出非错误提示且退出码为 0', () => {
  const dataFile = tempDataFile();
  const result = runCliProcess(['list'], dataFile);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.notEqual(result.stdout.trim(), '');
});

test('端到端: 未知命令退出码非零且错误只写入 stderr', () => {
  const result = runCliProcess(['frobnicate'], tempDataFile());

  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /未知命令/);
});

test('端到端: 参数不足（缺少命令、add 缺标题、complete 缺 ID）退出码非零', () => {
  const dataFile = tempDataFile();

  const noCommand = runCliProcess([], dataFile);
  assert.notEqual(noCommand.status, 0);
  assert.equal(noCommand.stdout, '');
  assert.notEqual(noCommand.stderr.trim(), '');

  const noTitle = runCliProcess(['add'], dataFile);
  assert.notEqual(noTitle.status, 0);
  assert.equal(noTitle.stdout, '');
  assert.notEqual(noTitle.stderr.trim(), '');

  const noId = runCliProcess(['complete'], dataFile);
  assert.notEqual(noId.status, 0);
  assert.equal(noId.stdout, '');
  assert.notEqual(noId.stderr.trim(), '');
});

test('端到端: 空标题退出码非零且错误只写入 stderr', () => {
  const result = runCliProcess(['add', '   '], tempDataFile());

  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, '');
  assert.notEqual(result.stderr.trim(), '');
});

test('端到端: 非法 ID 退出码非零且错误只写入 stderr', () => {
  const result = runCliProcess(['complete', 'abc'], tempDataFile());

  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, '');
  assert.notEqual(result.stderr.trim(), '');
});

test('端到端: 不存在 ID 退出码非零且错误只写入 stderr', () => {
  const dataFile = tempDataFile();
  const add = runCliProcess(['add', '唯一任务'], dataFile);
  assert.equal(add.status, 0, add.stderr);

  const result = runCliProcess(['remove', '99'], dataFile);

  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, '');
  assert.notEqual(result.stderr.trim(), '');
});

test('端到端: 所有测试均使用注入的临时数据文件，不污染项目默认 JSON 数据文件', () => {
  const existedBefore = existsSync(DEFAULT_DATA_FILE);
  const contentBefore = existedBefore
    ? readFileSync(DEFAULT_DATA_FILE, 'utf8')
    : null;

  // 用注入的临时数据文件执行一轮完整命令
  const dataFile = tempDataFile();
  for (const args of [
    ['add', '隔离任务'],
    ['list'],
    ['complete', '1'],
    ['remove', '1'],
  ]) {
    const result = runCliProcess(args, dataFile);
    assert.equal(result.status, 0, result.stderr);
  }

  // 项目默认数据文件不应被本轮执行创建或修改
  if (existedBefore) {
    assert.equal(readFileSync(DEFAULT_DATA_FILE, 'utf8'), contentBefore);
  } else {
    assert.equal(existsSync(DEFAULT_DATA_FILE), false);
  }
});
