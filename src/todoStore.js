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

  function list() {
    return [...todos];
  }

  function complete(id) {
    const todo = todos.find((item) => item.id === id);
    if (!todo) {
      throw new RangeError(`Todo ${id} not found`);
    }
    todo.completed = true;
    return todo;
  }

  function remove(id) {
    const index = todos.findIndex((item) => item.id === id);
    if (index === -1) {
      throw new RangeError(`Todo ${id} not found`);
    }
    const [removed] = todos.splice(index, 1);
    return removed;
  }

  return {
    add,
    list,
    complete,
    remove,
  };
}
