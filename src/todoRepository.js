import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

function serialize(data) {
  return `${JSON.stringify(data, null, 2)}\n`;
}

function cloneTodo(todo) {
  return { ...todo };
}

export function createTodoRepository(filePath) {
  let loaded = false;
  let todos = [];
  let nextId = 1;

  function persist() {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, serialize({ todos, nextId }), 'utf8');
  }

  function load() {
    if (loaded) {
      return;
    }
    if (existsSync(filePath)) {
      let raw;
      try {
        raw = JSON.parse(readFileSync(filePath, 'utf8'));
      } catch (cause) {
        throw new Error(`无法解析 Todo 数据文件（JSON 损坏）: ${filePath}`, { cause });
      }
      todos = raw.todos;
      nextId = raw.nextId;
    } else {
      persist();
    }
    loaded = true;
  }

  function assertValidTitle(title) {
    if (typeof title !== 'string' || title.trim() === '') {
      throw new TypeError('title 必须是非空字符串');
    }
  }

  function assertValidId(id) {
    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
      throw new TypeError('id 必须是正整数');
    }
  }

  function add(title) {
    load();
    assertValidTitle(title);
    const todo = {
      id: nextId,
      title,
      completed: false,
    };
    nextId += 1;
    todos.push(todo);
    persist();
    return cloneTodo(todo);
  }

  function findIndex(id) {
    const index = todos.findIndex((todo) => todo.id === id);
    if (index === -1) {
      throw new RangeError(`Todo ${id} 不存在`);
    }
    return index;
  }

  function complete(id) {
    load();
    assertValidId(id);
    const index = findIndex(id);
    const updated = { ...todos[index], completed: true };
    todos[index] = updated;
    persist();
    return cloneTodo(updated);
  }

  function remove(id) {
    load();
    assertValidId(id);
    const index = findIndex(id);
    const [removed] = todos.splice(index, 1);
    persist();
    return cloneTodo(removed);
  }

  function list() {
    load();
    const sorted = [...todos].sort((a, b) => a.id - b.id);
    return sorted.map(cloneTodo);
  }

  return {
    add,
    complete,
    list,
    remove,
  };
}
