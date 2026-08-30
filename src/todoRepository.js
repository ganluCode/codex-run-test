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
      const raw = JSON.parse(readFileSync(filePath, 'utf8'));
      todos = raw.todos;
      nextId = raw.nextId;
    } else {
      persist();
    }
    loaded = true;
  }

  function add(title) {
    load();
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

  function list() {
    load();
    const sorted = [...todos].sort((a, b) => a.id - b.id);
    return sorted.map(cloneTodo);
  }

  return {
    add,
    list,
  };
}
