export function createTodoStore() {
  const todos = [];
  let nextId = 1;

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
    return todo;
  }

  function list(options) {
    if (options === undefined || options === null) {
      return [...todos];
    }

    const { completed } = options;
    if (completed === undefined) {
      return [...todos];
    }
    if (typeof completed !== 'boolean') {
      throw new TypeError('completed filter must be a boolean');
    }

    return todos.filter((todo) => todo.completed === completed);
  }

  function complete(id) {
    const todo = todos.find((item) => item.id === id);
    if (!todo) {
      throw new RangeError(`Todo ${id} not found`);
    }
    todo.completed = true;
    return todo;
  }

  function stats() {
    const completed = todos.filter((todo) => todo.completed).length;
    return {
      total: todos.length,
      active: todos.length - completed,
      completed,
    };
  }

  function remove(id) {
    const index = todos.findIndex((item) => item.id === id);
    if (index === -1) {
      throw new RangeError(`Todo ${id} not found`);
    }
    const [removed] = todos.splice(index, 1);
    return removed;
  }

  function clearCompleted() {
    let clearedCount = 0;

    for (let index = todos.length - 1; index >= 0; index -= 1) {
      if (todos[index].completed) {
        todos.splice(index, 1);
        clearedCount += 1;
      }
    }

    return clearedCount;
  }

  return {
    add,
    list,
    complete,
    stats,
    clearCompleted,
    remove,
  };
}
