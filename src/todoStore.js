import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

function validateTodoShape(todo, index, filePath) {
  const label = `数据文件 ${filePath} 结构无效：todos[${index}]`;
  if (todo === null || typeof todo !== 'object' || Array.isArray(todo)) {
    throw new Error(`${label} 必须是对象`);
  }
  if (!Number.isSafeInteger(todo.id) || todo.id <= 0) {
    throw new Error(`${label}.id 必须是正的安全整数，收到：${String(todo.id)}`);
  }
  if (typeof todo.title !== 'string' || todo.title.trim() === '') {
    throw new Error(`${label}.title 必须是非空字符串`);
  }
  if (typeof todo.completed !== 'boolean') {
    throw new Error(`${label}.completed 必须是布尔值`);
  }
}

function validateState(raw, filePath) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`数据文件 ${filePath} 结构无效：根节点必须是对象`);
  }
  if (!Array.isArray(raw.todos)) {
    throw new Error(`数据文件 ${filePath} 结构无效：todos 必须是数组`);
  }
  const seenIds = new Set();
  let maxId = 0;
  const todos = raw.todos.map((todo, index) => {
    validateTodoShape(todo, index, filePath);
    if (seenIds.has(todo.id)) {
      throw new Error(`数据文件 ${filePath} 结构无效：todos[${index}].id 重复（${todo.id}）`);
    }
    seenIds.add(todo.id);
    maxId = Math.max(maxId, todo.id);
    return { id: todo.id, title: todo.title, completed: todo.completed };
  });
  const nextId = raw.nextId;
  if (!Number.isSafeInteger(nextId) || nextId <= 0 || nextId <= maxId) {
    throw new Error(
      `数据文件 ${filePath} 结构无效：nextId 必须是大于最大已有 id（${maxId}）的正安全整数，收到：${String(nextId)}`
    );
  }
  return { todos, nextId };
}

function loadPersistedState(filePath) {
  if (!existsSync(filePath)) {
    const emptyState = { todos: [], nextId: 1 };
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(emptyState, null, 2), 'utf8');
    return emptyState;
  }
  const text = readFileSync(filePath, 'utf8');
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new Error(`数据文件 ${filePath} 的 JSON 已损坏：${error.message}`);
  }
  return validateState(raw, filePath);
}

export function createTodoStore(options) {
  const filePath =
    options && typeof options === 'object' ? options.filePath : undefined;

  let todos = [];
  let nextId = 1;

  if (filePath !== undefined) {
    const state = loadPersistedState(filePath);
    todos = state.todos;
    nextId = state.nextId;
  }

  function save() {
    if (filePath === undefined) {
      return;
    }
    writeFileSync(
      filePath,
      JSON.stringify({ todos, nextId }, null, 2),
      'utf8'
    );
  }

  function reload() {
    if (filePath === undefined) {
      return;
    }
    const state = loadPersistedState(filePath);
    todos = state.todos;
    nextId = state.nextId;
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
    save();
    return todo;
  }

  function list() {
    return [...todos];
  }

  function assertValidId(id, operation) {
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new TypeError(
        `${operation} 的 id 必须是正的安全整数，收到：${String(id)}`
      );
    }
  }

  function complete(id) {
    assertValidId(id, 'complete');
    const todo = todos.find((item) => item.id === id);
    if (!todo) {
      throw new RangeError(`Todo ${id} not found`);
    }
    todo.completed = true;
    save();
    return todo;
  }

  function remove(id) {
    assertValidId(id, 'remove');
    const index = todos.findIndex((item) => item.id === id);
    if (index === -1) {
      throw new RangeError(`Todo ${id} not found`);
    }
    const [removed] = todos.splice(index, 1);
    save();
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
