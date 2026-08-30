#!/usr/bin/env node
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createTodoRepository } from './todoRepository.js';

// 默认 JSON 数据文件固定在项目目录内（<项目根>/data/todos.json），
// 不同 CLI 进程在未指定数据文件时使用同一默认文件。
export const DEFAULT_DATA_FILE = join(
  fileURLToPath(new URL('..', import.meta.url)),
  'data',
  'todos.json',
);

// 测试可通过 TODO_DATA_FILE 环境变量注入数据文件路径。
export function resolveDataFile(env = process.env) {
  return env.TODO_DATA_FILE || DEFAULT_DATA_FILE;
}

function formatStatus(completed) {
  return completed ? '已完成' : '未完成';
}

function formatTodoLine(todo) {
  return `#${todo.id} [${formatStatus(todo.completed)}] ${todo.title}`;
}

function runAdd(repository, args, stdout) {
  const title = args.join(' ');
  if (title.trim() === '') {
    throw new TypeError('add 需要非空标题，用法: add <title>');
  }
  const todo = repository.add(title);
  stdout.write(`已添加 ${formatTodoLine(todo)}\n`);
  return 0;
}

function runList(repository, stdout) {
  const todos = repository.list();
  if (todos.length === 0) {
    stdout.write('暂无 Todo，可使用 add <title> 新增任务\n');
    return 0;
  }
  for (const todo of todos) {
    stdout.write(`${formatTodoLine(todo)}\n`);
  }
  return 0;
}

// CLI 仅负责把字符串参数转换为正整数 ID，业务校验由持久化核心完成。
function parseIdArg(raw, command) {
  if (raw === undefined || String(raw).trim() === '') {
    throw new TypeError(`${command} 缺少 ID，用法: ${command} <id>`);
  }
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new TypeError(`${command} 需要 ID 为正整数，用法: ${command} <id>`);
  }
  return id;
}

function runComplete(repository, args, stdout) {
  const id = parseIdArg(args[0], 'complete');
  const todo = repository.complete(id);
  stdout.write(`已完成 ${formatTodoLine(todo)}\n`);
  return 0;
}

function runRemove(repository, args, stdout) {
  const id = parseIdArg(args[0], 'remove');
  const todo = repository.remove(id);
  stdout.write(`已删除 ${formatTodoLine(todo)}\n`);
  return 0;
}

/**
 * 可注入的 CLI 命令执行函数。
 *
 * @param {string[]} argv - 命令行参数（不含 node 与入口脚本路径）
 * @param {object} [options]
 * @param {object} [options.stdout] - 标准输出流，默认 process.stdout
 * @param {object} [options.stderr] - 标准错误流，默认 process.stderr
 * @param {string} [options.dataFile] - 数据文件路径，默认 resolveDataFile()
 * @returns {number} 进程退出码
 */
export function runCli(argv, options = {}) {
  const {
    stdout = process.stdout,
    stderr = process.stderr,
    dataFile = resolveDataFile(),
  } = options;

  // 接入既有持久化 Todo 核心；核心负责首次创建缺失的数据文件和目录。
  const repository = createTodoRepository(dataFile);
  const [command, ...args] = argv;

  try {
    switch (command) {
      case 'add':
        return runAdd(repository, args, stdout);
      case 'list':
        if (args.length > 0) {
          throw new TypeError('list 不接受位置参数，用法: list');
        }
        return runList(repository, stdout);
      case 'complete':
        return runComplete(repository, args, stdout);
      case 'remove':
        return runRemove(repository, args, stdout);
      case undefined:
        throw new TypeError(
          '缺少命令，可用命令: add <title> | list | complete <id> | remove <id>',
        );
      default:
        stderr.write(`未知命令: ${command}\n`);
        return 1;
    }
  } catch (error) {
    stderr.write(`错误: ${error.message}\n`);
    return 1;
  }
}

function isDirectRun() {
  const entry = process.argv[1];
  return (
    typeof entry === 'string' &&
    import.meta.url === pathToFileURL(entry).href
  );
}

if (isDirectRun()) {
  process.exitCode = runCli(process.argv.slice(2));
}
