import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

function isValidId(id) {
  return Number.isSafeInteger(id) && id > 0;
}

function assertValidId(id) {
  if (!isValidId(id)) {
    throw new TypeError(`id must be a positive safe integer, got: ${id}`);
  }
}

function validateTitle(title) {
  if (typeof title !== 'string' || title.trim() === '') {
    throw new TypeError('title must be a non-empty string');
  }
}

function parseStoreData(raw, filePath) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Todo 数据文件损坏: ${filePath} — JSON 解析失败: ${error.message}`);
  }

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error(`Todo 数据文件无效: ${filePath} — 顶层必须是对象`);
  }
  if (!Array.isArray(data.todos)) {
    throw new Error(`Todo 数据文件无效: ${filePath} — todos 必须是数组`);
  }

  const seenIds = new Set();
  let maxId = 0;
  for (const todo of data.todos) {
    if (typeof todo !== 'object' || todo === null || Array.isArray(todo)) {
      throw new Error(`Todo 数据文件无效: ${filePath} — todo 条目必须是对象`);
    }
    if (!isValidId(todo.id)) {
      throw new Error(`Todo 数据文件无效: ${filePath} — todo.id 必须是正的安全整数，got: ${todo.id}`);
    }
    if (seenIds.has(todo.id)) {
      throw new Error(`Todo 数据文件无效: ${filePath} — 重复的 todo.id: ${todo.id}`);
    }
    seenIds.add(todo.id);
    if (typeof todo.title !== 'string' || todo.title.trim() === '') {
      throw new Error(`Todo 数据文件无效: ${filePath} — todo.title 必须是非空字符串`);
    }
    if (typeof todo.completed !== 'boolean') {
      throw new Error(`Todo 数据文件无效: ${filePath} — todo.completed 必须是布尔值`);
    }
    maxId = Math.max(maxId, todo.id);
  }

  if (!isValidId(data.nextId) || data.nextId <= maxId) {
    throw new Error(`Todo 数据文件无效: ${filePath} — nextId 必须是大于所有已有 id 的正整数，got: ${data.nextId}`);
  }

  return { todos: data.todos.map((todo) => ({ ...todo })), nextId: data.nextId };
}

export function createTodoStore(options = {}) {
  const filePath = typeof options === 'object' && options !== null && typeof options.filePath === 'string'
    ? options.filePath
    : null;

  let todos = [];
  let nextId = 1;

  function save() {
    if (filePath === null) {
      return;
    }
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify({ todos, nextId }, null, 2), 'utf8');
  }

  function loadFromDisk() {
    const raw = readFileSync(filePath, 'utf8');
    const parsed = parseStoreData(raw, filePath);
    todos = parsed.todos;
    nextId = parsed.nextId;
  }

  if (filePath !== null) {
    if (existsSync(filePath)) {
      loadFromDisk();
    } else {
      save();
    }
  }

  function add(title) {
    validateTitle(title);
    const todo = {
      id: nextId,
      title,
      completed: false,
    };
    nextId += 1;
    todos.push(todo);
    save();
    return todo;
  }

  function list() {
    return [...todos];
  }

  function complete(id) {
    assertValidId(id);
    const todo = todos.find((item) => item.id === id);
    if (!todo) {
      throw new RangeError(`Todo ${id} not found`);
    }
    todo.completed = true;
    save();
    return todo;
  }

  function remove(id) {
    assertValidId(id);
    const index = todos.findIndex((item) => item.id === id);
    if (index === -1) {
      throw new RangeError(`Todo ${id} not found`);
    }
    const [removed] = todos.splice(index, 1);
    save();
    return removed;
  }

  function reload() {
    if (filePath === null) {
      return;
    }
    loadFromDisk();
  }

  return {
    add,
    list,
    complete,
    remove,
    reload,
  };
}
