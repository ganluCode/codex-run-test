export function createTodoStore() {
  const todos = [];
  let nextId = 1;

  function add(title) {
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

  return {
    add,
    list,
    complete,
  };
}
