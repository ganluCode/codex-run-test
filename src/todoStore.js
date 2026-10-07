import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

function isSafeInteger(value) {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function validateTodo(todo, index, filePath) {
  if (typeof todo !== 'object' || todo === null) {
    throw new Error(`数据文件 ${filePath} 的 Todo[${index}] 必须是对象`);
  }
  if (!isSafeInteger(todo.id) || todo.id <= 0) {
    throw new Error(`数据文件 ${filePath} 的 Todo[${index}].id 必须是正安全整数，实际为 ${JSON.stringify(todo.id)}`);
  }
  if (typeof todo.title !== 'string' || todo.title.trim() === '') {
    throw new Error(`数据文件 ${filePath} 的 Todo[${index}].title 必须是非空字符串`);
  }
  if (typeof todo.completed !== 'boolean') {
    throw new Error(`数据文件 ${filePath} 的 Todo[${index}].completed 必须是布尔值`);
  }
}

function validateState(raw, filePath) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error(`数据文件 ${filePath} 的 JSON 根节点必须是对象`);
  }
  if (!Array.isArray(raw.todos)) {
    throw new Error(`数据文件 ${filePath} 的 todos 必须是数组`);
  }
  const seenIds = new Set();
  let maxId = 0;
  raw.todos.forEach((todo, index) => {
    validateTodo(todo, index, filePath);
    if (seenIds.has(todo.id)) {
      throw new Error(`数据文件 ${filePath} 存在重复的 Todo id: ${todo.id}`);
    }
    seenIds.add(todo.id);
    if (todo.id > maxId) {
      maxId = todo.id;
    }
  });
  if (!isSafeInteger(raw.nextId) || raw.nextId <= 0) {
    throw new Error(`数据文件 ${filePath} 的 nextId 必须是正安全整数`);
  }
  if (raw.nextId <= maxId) {
    throw new Error(
      `数据文件 ${filePath} 的 nextId (${raw.nextId}) 必须大于已使用的最大 id (${maxId})`,
    );
  }
  return { todos: raw.todos, nextId: raw.nextId };
}

function loadFromFile(filePath) {
  let raw;
  try {
    raw = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(
      `数据文件 ${filePath} 包含损坏的 JSON: ${error.message}`,
      { cause: error },
    );
  }
  return validateState(raw, filePath);
}

function assertValidId(id) {
  if (!isSafeInteger(id) || id <= 0) {
    throw new TypeError(`id 必须是正安全整数，实际为 ${JSON.stringify(id)}`);
  }
}

export function createTodoStore(options = {}) {
  const filePath = options.filePath ?? null;

  let todos = [];
  let nextId = 1;

  function saveToFile() {
    writeFileSync(
      filePath,
      JSON.stringify({ todos, nextId }, null, 2),
      'utf8',
    );
  }

  function reload() {
    if (filePath === null) {
      return;
    }
    const state = loadFromFile(filePath);
    todos = state.todos;
    nextId = state.nextId;
  }

  if (filePath !== null) {
    if (!existsSync(filePath)) {
      mkdirSync(dirname(filePath), { recursive: true });
      saveToFile();
    } else {
      reload();
    }
  }

  function add(title) {
    if (typeof title !== 'string' || title.trim() === '') {
      throw new TypeError('title must be a non-empty string');
    }
    const todo = {
      id: nextId,
      title,
      completed: false,
    };
    nextId += 1;
    todos.push(todo);
    if (filePath !== null) {
      saveToFile();
    }
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
    if (filePath !== null) {
      saveToFile();
    }
    return todo;
  }

  function remove(id) {
    assertValidId(id);
    const index = todos.findIndex((item) => item.id === id);
    if (index === -1) {
      throw new RangeError(`Todo ${id} not found`);
    }
    const [removed] = todos.splice(index, 1);
    if (filePath !== null) {
      saveToFile();
    }
    return removed;
  }

  return {
    add,
    list,
    complete,
    remove,
    reload,
  };
}
