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
  const exitCode = runCli(['list'], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    dataFile: tempDataFile(),
  });

  assert.equal(exitCode, 0);
});

test('runCli 通过注入的数据文件接入持久化核心，首次运行创建缺失文件和目录', () => {
  const dataFile = tempDataFile();
  assert.equal(existsSync(dataFile), false);

  const exitCode = runCli(['list'], {
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

  const result = spawnSync(process.execPath, [cliEntry, 'list'], {
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

test('complete 命令调用核心完成指定任务，stdout 输出成功结果并以退出码 0 结束', () => {
  const dataFile = tempDataFile();
  const repository = createTodoRepository(dataFile);
  const todo = repository.add('复习笔记');

  const stdout = createStreams();
  const stderr = createStreams();
  const exitCode = runCli(['complete', String(todo.id)], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    dataFile,
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr.getOutput(), '');
  const output = stdout.getOutput();
  assert.match(output, /复习笔记/);
  assert.match(output, /已完成/);

  const stored = createTodoRepository(dataFile).list();
  assert.equal(stored.length, 1);
  assert.equal(stored[0].completed, true);
});

test('remove 命令调用核心删除指定任务，stdout 输出成功结果并以退出码 0 结束', () => {
  const dataFile = tempDataFile();
  const repository = createTodoRepository(dataFile);
  const todo = repository.add('过期任务');

  const stdout = createStreams();
  const stderr = createStreams();
  const exitCode = runCli(['remove', String(todo.id)], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    dataFile,
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr.getOutput(), '');
  const output = stdout.getOutput();
  assert.match(output, /过期任务/);
  assert.match(output, /删除/);

  const stored = createTodoRepository(dataFile).list();
  assert.equal(stored.length, 0);
});

test('完成后以同一数据文件再次执行 list 可看到完成状态', () => {
  const dataFile = tempDataFile();

  assert.equal(
    runCli(['add', '提交报销'], {
      stdout: createStreams().stream,
      stderr: createStreams().stream,
      dataFile,
    }),
    0,
  );
  assert.equal(
    runCli(['complete', '1'], {
      stdout: createStreams().stream,
      stderr: createStreams().stream,
      dataFile,
    }),
    0,
  );

  const stdout = createStreams();
  const stderr = createStreams();
  const listCode = runCli(['list'], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    dataFile,
  });

  assert.equal(listCode, 0);
  assert.equal(stderr.getOutput(), '');
  const output = stdout.getOutput();
  assert.match(output, /提交报销/);
  const line = output.trim().split('\n').find((l) => l.includes('提交报销'));
  assert.match(line, /已完成/);
});

test('删除后以同一数据文件再次执行 list 不再显示已删除任务', () => {
  const dataFile = tempDataFile();

  assert.equal(
    runCli(['add', '临时任务'], {
      stdout: createStreams().stream,
      stderr: createStreams().stream,
      dataFile,
    }),
    0,
  );
  assert.equal(
    runCli(['add', '常驻任务'], {
      stdout: createStreams().stream,
      stderr: createStreams().stream,
      dataFile,
    }),
    0,
  );
  assert.equal(
    runCli(['remove', '1'], {
      stdout: createStreams().stream,
      stderr: createStreams().stream,
      dataFile,
    }),
    0,
  );

  const stdout = createStreams();
  const stderr = createStreams();
  const listCode = runCli(['list'], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    dataFile,
  });

  assert.equal(listCode, 0);
  assert.equal(stderr.getOutput(), '');
  const output = stdout.getOutput();
  assert.doesNotMatch(output, /临时任务/);
  assert.match(output, /常驻任务/);
});

test('complete 不存在的 ID 时错误写入 stderr 且退出码非零', () => {
  const dataFile = tempDataFile();
  const stdout = createStreams();
  const stderr = createStreams();

  const exitCode = runCli(['complete', '99'], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    dataFile,
  });

  assert.notEqual(exitCode, 0);
  assert.equal(stdout.getOutput(), '');
  assert.notEqual(stderr.getOutput().trim(), '');
});

test('remove 不存在的 ID 时错误写入 stderr 且退出码非零', () => {
  const dataFile = tempDataFile();
  const stdout = createStreams();
  const stderr = createStreams();

  const exitCode = runCli(['remove', '99'], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    dataFile,
  });

  assert.notEqual(exitCode, 0);
  assert.equal(stdout.getOutput(), '');
  assert.notEqual(stderr.getOutput().trim(), '');
});

test('缺少命令时输出明确错误到 stderr 且退出码非零', () => {
  const dataFile = tempDataFile();
  const stdout = createStreams();
  const stderr = createStreams();

  const exitCode = runCli([], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    dataFile,
  });

  assert.notEqual(exitCode, 0);
  assert.equal(stdout.getOutput(), '');
  assert.notEqual(stderr.getOutput().trim(), '');
  assert.match(stderr.getOutput(), /命令/);
});

test('未知命令时输出明确错误到 stderr 且退出码非零', () => {
  const dataFile = tempDataFile();
  const stdout = createStreams();
  const stderr = createStreams();

  const exitCode = runCli(['unknown'], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    dataFile,
  });

  assert.notEqual(exitCode, 0);
  assert.equal(stdout.getOutput(), '');
  assert.notEqual(stderr.getOutput().trim(), '');
  assert.match(stderr.getOutput(), /未知命令/);
});

test('list 带多余位置参数时输出错误到 stderr 且退出码非零', () => {
  const dataFile = tempDataFile();
  const stdout = createStreams();
  const stderr = createStreams();

  const exitCode = runCli(['list', '多余参数'], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    dataFile,
  });

  assert.notEqual(exitCode, 0);
  assert.equal(stdout.getOutput(), '');
  assert.notEqual(stderr.getOutput().trim(), '');
});

test('add 缺少标题时输出错误到 stderr 且退出码非零', () => {
  const dataFile = tempDataFile();
  const stdout = createStreams();
  const stderr = createStreams();

  const exitCode = runCli(['add'], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    dataFile,
  });

  assert.notEqual(exitCode, 0);
  assert.equal(stdout.getOutput(), '');
  assert.notEqual(stderr.getOutput().trim(), '');
});

test('add 标题仅含空白时输出错误到 stderr 且退出码非零', () => {
  const dataFile = tempDataFile();
  const stdout = createStreams();
  const stderr = createStreams();

  const exitCode = runCli(['add', '   '], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    dataFile,
  });

  assert.notEqual(exitCode, 0);
  assert.equal(stdout.getOutput(), '');
  assert.notEqual(stderr.getOutput().trim(), '');
});

test('complete 缺少 ID 时输出错误到 stderr 且退出码非零', () => {
  const dataFile = tempDataFile();
  const stdout = createStreams();
  const stderr = createStreams();

  const exitCode = runCli(['complete'], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    dataFile,
  });

  assert.notEqual(exitCode, 0);
  assert.equal(stdout.getOutput(), '');
  assert.notEqual(stderr.getOutput().trim(), '');
});

test('remove 缺少 ID 时输出错误到 stderr 且退出码非零', () => {
  const dataFile = tempDataFile();
  const stdout = createStreams();
  const stderr = createStreams();

  const exitCode = runCli(['remove'], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    dataFile,
  });

  assert.notEqual(exitCode, 0);
  assert.equal(stdout.getOutput(), '');
  assert.notEqual(stderr.getOutput().trim(), '');
});

for (const command of ['complete', 'remove']) {
  for (const invalidId of ['abc', '0', '-1', '1.5']) {
    test(`${command} 的 ID 为非正整数 ${invalidId} 时错误只写入 stderr 且退出码非零`, () => {
      const dataFile = tempDataFile();
      const repository = createTodoRepository(dataFile);
      repository.add('占位任务');

      const stdout = createStreams();
      const stderr = createStreams();
      const exitCode = runCli([command, invalidId], {
        stdout: stdout.stream,
        stderr: stderr.stream,
        dataFile,
      });

      assert.notEqual(exitCode, 0);
      assert.equal(stdout.getOutput(), '');
      assert.notEqual(stderr.getOutput().trim(), '');
    });
  }
}
