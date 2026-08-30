import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { DEFAULT_DATA_FILE } from '../src/cli.js';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const cliEntry = join(projectRoot, 'src', 'cli.js');

/**
 * 端到端测试基础设施：为单个测试创建独立的临时目录，
 * 并在该测试结束时（无论成败）只清理本测试创建的临时目录。
 * 所有 e2e 测试统一通过 TODO_DATA_FILE 注入隔离的数据文件，
 * 不污染项目默认 JSON 数据文件。
 *
 * @param {import('node:test').TestContext} t - 当前测试上下文
 * @returns {string} 本测试独占的临时目录路径
 */
function createTempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'todo-cli-e2e-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// 在独立临时目录下创建本测试专属的数据文件路径，测试结束后随目录一并清理。
function tempDataFile(t) {
  return join(createTempDir(t), 'todos.json');
}

// 以真实子进程执行 CLI 入口（独立 Node.js 进程），返回退出码与 stdout / stderr 内容。
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

test('端到端: add 写入任务后，后续独立的 list 子进程能读取该任务', (t) => {
  const dataFile = tempDataFile(t);

  const add = runCliProcess(['add', '跨进程任务'], dataFile);
  assert.equal(add.status, 0, add.stderr);
  assert.equal(add.stderr, '');

  // list 由全新的子进程执行，与 add 进程无任何共享内存
  const list = runCliProcess(['list'], dataFile);
  assert.equal(list.status, 0, list.stderr);
  assert.equal(list.stderr, '');
  assert.match(list.stdout, /#1 \[未完成\] 跨进程任务/);
});

test('端到端: complete 执行后，后续 list 子进程输出明确反映任务已完成', (t) => {
  const dataFile = tempDataFile(t);

  assert.equal(runCliProcess(['add', '待完成任务'], dataFile).status, 0);
  const complete = runCliProcess(['complete', '1'], dataFile);
  assert.equal(complete.status, 0, complete.stderr);

  const list = runCliProcess(['list'], dataFile);
  assert.equal(list.status, 0, list.stderr);
  const line = list.stdout
    .trim()
    .split('\n')
    .find((l) => l.includes('待完成任务'));
  assert.ok(line, 'list 应包含已添加的任务');
  assert.match(line, /已完成/);
});

test('端到端: remove 执行后，后续 list 子进程输出不再包含被删除任务', (t) => {
  const dataFile = tempDataFile(t);

  assert.equal(runCliProcess(['add', '将被删除'], dataFile).status, 0);
  assert.equal(runCliProcess(['add', '保留任务'], dataFile).status, 0);
  const remove = runCliProcess(['remove', '1'], dataFile);
  assert.equal(remove.status, 0, remove.stderr);

  const list = runCliProcess(['list'], dataFile);
  assert.equal(list.status, 0, list.stderr);
  assert.doesNotMatch(list.stdout, /将被删除/);
  assert.match(list.stdout, /保留任务/);
});

test('端到端: add / list / complete / remove 全流程跨进程读写同一数据文件', (t) => {
  const dataFile = tempDataFile(t);

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

test('端到端: 空列表输出非错误提示且退出码为 0', (t) => {
  const dataFile = tempDataFile(t);
  const result = runCliProcess(['list'], dataFile);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.notEqual(result.stdout.trim(), '');
});

test('端到端: 未知命令退出码非零且错误只写入 stderr', (t) => {
  const result = runCliProcess(['frobnicate'], tempDataFile(t));

  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /未知命令/);
});

test('端到端: 参数不足（缺少命令、add 缺标题、complete 缺 ID）退出码非零', (t) => {
  const dataFile = tempDataFile(t);

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

test('端到端: 空标题退出码非零且错误只写入 stderr', (t) => {
  const result = runCliProcess(['add', '   '], tempDataFile(t));

  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, '');
  assert.notEqual(result.stderr.trim(), '');
});

test('端到端: 非法 ID 退出码非零且错误只写入 stderr', (t) => {
  const result = runCliProcess(['complete', 'abc'], tempDataFile(t));

  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, '');
  assert.notEqual(result.stderr.trim(), '');
});

test('端到端: 不存在 ID 退出码非零且错误只写入 stderr', (t) => {
  const dataFile = tempDataFile(t);
  const add = runCliProcess(['add', '唯一任务'], dataFile);
  assert.equal(add.status, 0, add.stderr);

  const result = runCliProcess(['remove', '99'], dataFile);

  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, '');
  assert.notEqual(result.stderr.trim(), '');
});

test('端到端: 所有测试均使用注入的临时数据文件，不污染项目默认 JSON 数据文件', (t) => {
  const existedBefore = existsSync(DEFAULT_DATA_FILE);
  const contentBefore = existedBefore
    ? readFileSync(DEFAULT_DATA_FILE, 'utf8')
    : null;

  // 用注入的临时数据文件执行一轮完整命令
  const dataFile = tempDataFile(t);
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

test('端到端: 两个独立数据文件中的任务数据互不出现且互不影响', (t) => {
  const dataFileA = tempDataFile(t);
  const dataFileB = tempDataFile(t);

  // 各自独立写入任务，ID 计数从各自数据文件独立递增
  const addA = runCliProcess(['add', '文件A任务'], dataFileA);
  assert.equal(addA.status, 0, addA.stderr);
  assert.match(addA.stdout, /#1 \[未完成\] 文件A任务/);

  const addB = runCliProcess(['add', '文件B任务'], dataFileB);
  assert.equal(addB.status, 0, addB.stderr);
  assert.match(addB.stdout, /#1 \[未完成\] 文件B任务/);

  // list 只能看到自己数据文件中的任务
  const listA = runCliProcess(['list'], dataFileA);
  assert.equal(listA.status, 0, listA.stderr);
  assert.doesNotMatch(listA.stdout, /文件B任务/);
  assert.match(listA.stdout, /文件A任务/);

  const listB = runCliProcess(['list'], dataFileB);
  assert.equal(listB.status, 0, listB.stderr);
  assert.doesNotMatch(listB.stdout, /文件A任务/);
  assert.match(listB.stdout, /文件B任务/);

  // 对 A 的修改（complete + remove）不影响 B 的数据
  assert.equal(runCliProcess(['complete', '1'], dataFileA).status, 0);
  assert.equal(runCliProcess(['remove', '1'], dataFileA).status, 0);

  const listBAfter = runCliProcess(['list'], dataFileB);
  assert.equal(listBAfter.status, 0, listBAfter.stderr);
  const linesB = listBAfter.stdout.trim().split('\n');
  assert.equal(linesB.length, 1);
  assert.match(linesB[0], /#1 \[未完成\] 文件B任务/);

  const listAAfter = runCliProcess(['list'], dataFileA);
  assert.equal(listAAfter.status, 0, listAAfter.stderr);
  assert.doesNotMatch(listAAfter.stdout, /文件B任务/);
});

test('端到端: 失败路径不删除或修改项目默认数据文件及用户已有数据', (t) => {
  const existedBefore = existsSync(DEFAULT_DATA_FILE);
  const contentBefore = existedBefore
    ? readFileSync(DEFAULT_DATA_FILE, 'utf8')
    : null;

  // 覆盖全部指定的失败退出路径，全部使用临时数据文件
  const failureCases = [
    [['add', '   '], tempDataFile(t)],
    [['complete', 'abc'], tempDataFile(t)],
    [['remove', 'abc'], tempDataFile(t)],
    [['complete', '99'], tempDataFile(t)],
    [['remove', '99'], tempDataFile(t)],
    [['frobnicate'], tempDataFile(t)],
    [[], tempDataFile(t)],
    [['add'], tempDataFile(t)],
    [['complete'], tempDataFile(t)],
    [['remove'], tempDataFile(t)],
  ];
  for (const [args, dataFile] of failureCases) {
    const result = runCliProcess(args, dataFile);
    assert.notEqual(result.status, 0, `应非零退出: ${args.join(' ')}`);
    assert.equal(result.stdout, '', `stdout 应为空: ${args.join(' ')}`);
    assert.notEqual(result.stderr.trim(), '', `stderr 应有错误: ${args.join(' ')}`);
  }

  // 项目默认数据文件不应被任何失败路径创建、删除或修改
  if (existedBefore) {
    assert.equal(existsSync(DEFAULT_DATA_FILE), true);
    assert.equal(readFileSync(DEFAULT_DATA_FILE, 'utf8'), contentBefore);
  } else {
    assert.equal(existsSync(DEFAULT_DATA_FILE), false);
  }
});

test('端到端: 测试结束后临时目录已被清理', (t) => {
  const dataFile = tempDataFile(t);
  const dir = join(dataFile, '..');

  const add = runCliProcess(['add', '清理验证'], dataFile);
  assert.equal(add.status, 0, add.stderr);
  assert.equal(existsSync(dataFile), true);

  // 注册在 tempDataFile 之后的清理钩子先执行，此处验证数据文件已随目录删除
  t.after(() => {
    assert.equal(existsSync(dir), false, `临时目录应被清理: ${dir}`);
  });
});
