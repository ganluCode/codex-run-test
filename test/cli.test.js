import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

import { DEFAULT_DATA_FILE, resolveDataFile, runCli } from '../src/cli.js';

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
