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
  repository.list();

  // 具体命令分发（add/list/complete/remove）由后续任务实现。
  void argv;
  void stdout;
  void stderr;
  return 0;
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
