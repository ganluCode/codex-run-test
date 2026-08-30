import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

import { DEFAULT_DATA_FILE, resolveDataFile, runCli } from '../src/cli.js';
import { createTodoRepository } from '../src/todoRepository.js';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const cliEntry = join(projectRoot, 'src', 'cli.js');

function tempDataFile() {
  const dir = mkdtempSync(join(tmpdir(), 'todo-cli-'));
  return join(dir, 'nested', 'todos.json');
}

function createStreams() {
  const chunks = [];
  return {
    stream: {
      write(chunk) {
        chunks.push(String(chunk));
        return true;
      },
    },
    getOutput() {
      return chunks.join('');
    },
  };
}

test('runCli 支持注入参数、输出流和数据文件路径并返回退出码', () => {
  const stdout = createStreams();
  const stderr = createStreams();
  const exitCode = runCli([], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    dataFile: tempDataFile(),
  });

  assert.equal(exitCode, 0);
});

test('runCli 通过注入的数据文件接入持久化核心，首次运行创建缺失文件和目录', () => {
  const dataFile = tempDataFile();
  assert.equal(existsSync(dataFile), false);

  const exitCode = runCli([], {
    stdout: createStreams().stream,
    stderr: createStreams().stream,
    dataFile,
  });

  assert.equal(exitCode, 0);
  assert.equal(existsSync(dataFile), true);
  const raw = JSON.parse(readFileSync(dataFile, 'utf8'));
  assert.ok(Array.isArray(raw.todos));
});

test('默认数据文件固定在项目目录内', () => {
  assert.ok(
    DEFAULT_DATA_FILE.startsWith(projectRoot),
    `默认数据文件应位于项目目录内: ${DEFAULT_DATA_FILE}`,
  );
  assert.equal(resolveDataFile({}), DEFAULT_DATA_FILE);
});

test('可通过 TODO_DATA_FILE 环境变量覆盖数据文件路径', () => {
  const override = join(tmpdir(), 'todo-env-override', 'todos.json');
  assert.equal(resolveDataFile({ TODO_DATA_FILE: override }), override);
});

test('不同 CLI 进程在未指定数据文件时解析出同一默认文件', () => {
  const script = `const mod = await import(${JSON.stringify(pathToFileURL(cliEntry).href)});
console.log(mod.DEFAULT_DATA_FILE);`;
  const secondCwd = mkdtempSync(join(tmpdir(), 'todo-cli-cwd-'));

  const results = [projectRoot, secondCwd].map((cwd) =>
    spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd,
      encoding: 'utf8',
    }),
  );

  for (const result of results) {
    assert.equal(result.status, 0, result.stderr);
  }
  const [first, second] = results.map((result) => result.stdout.trim());
  assert.equal(first, second);
  assert.ok(first.startsWith(projectRoot));
});

test('可通过 node 直接执行 CLI 入口，核心负责创建缺失的数据文件', () => {
  const dataFile = tempDataFile();
  assert.equal(existsSync(dataFile), false);

  const result = spawnSync(process.execPath, [cliEntry], {
    cwd: projectRoot,
    env: { ...process.env, TODO_DATA_FILE: dataFile },
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(dataFile), true);
  const raw = JSON.parse(readFileSync(dataFile, 'utf8'));
  assert.ok(Array.isArray(raw.todos));
});

test('add 命令通过持久化核心创建未完成任务，stdout 输出 ID、标题和未完成状态', () => {
  const dataFile = tempDataFile();
  const stdout = createStreams();
  const stderr = createStreams();

  const exitCode = runCli(['add', '买牛奶'], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    dataFile,
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr.getOutput(), '');
  const output = stdout.getOutput();
  assert.match(output, /1/);
  assert.match(output, /买牛奶/);
  assert.match(output, /未完成/);

  const todos = createTodoRepository(dataFile).list();
  assert.equal(todos.length, 1);
  assert.deepEqual(todos[0], { id: 1, title: '买牛奶', completed: false });
});

test('使用同一注入数据文件的后续 list 调用可列出此前 add 创建的任务', () => {
  const dataFile = tempDataFile();

  const addCode = runCli(['add', '写报告'], {
    stdout: createStreams().stream,
    stderr: createStreams().stream,
    dataFile,
  });
  assert.equal(addCode, 0);

  const stdout = createStreams();
  const stderr = createStreams();
  const listCode = runCli(['list'], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    dataFile,
  });

  assert.equal(listCode, 0);
  assert.equal(stderr.getOutput(), '');
  assert.match(stdout.getOutput(), /写报告/);
});

test('list 按 ID 升序输出所有任务，并清晰区分已完成和未完成状态', () => {
  const dataFile = tempDataFile();
  const repository = createTodoRepository(dataFile);
  repository.add('任务一');
  const second = repository.add('任务二');
  repository.complete(second.id);

  const stdout = createStreams();
  const stderr = createStreams();
  const exitCode = runCli(['list'], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    dataFile,
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr.getOutput(), '');
  const output = stdout.getOutput();
  const firstIndex = output.indexOf('任务一');
  const secondIndex = output.indexOf('任务二');
  assert.ok(firstIndex !== -1 && secondIndex !== -1, 'list 应输出所有任务');
  assert.ok(firstIndex < secondIndex, 'list 应按 ID 升序输出');
  const lines = output.trim().split('\n');
  assert.match(lines[0], /未完成/);
  assert.match(lines[1], /已完成/);
});

test('空列表输出明确的非错误提示，且退出码为 0', () => {
  const dataFile = tempDataFile();
  const stdout = createStreams();
  const stderr = createStreams();

  const exitCode = runCli(['list'], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    dataFile,
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr.getOutput(), '');
  assert.notEqual(stdout.getOutput().trim(), '');
});
