const VALID_PRIORITIES = new Set(['low', 'medium', 'high']);

export function parseTodoText(input) {
  if (typeof input !== 'string') {
    throw new TypeError('input must be a string');
  }

  const normalizedInput = input.trim();

  if (normalizedInput === '') {
    throw new TypeError('input must contain a title');
  }

  const tokens = normalizedInput.split(/\s+/).filter(Boolean);
  const titleTokens = [];
  const tags = [];
  const seenTags = new Set();
  let priority = 'medium';

  for (const token of tokens) {
    if (/^!\S+$/.test(token)) {
      const nextPriority = token.slice(1);

      if (!VALID_PRIORITIES.has(nextPriority)) {
        throw new RangeError(`Unknown priority token: ${token}`);
      }

      priority = nextPriority;
      continue;
    }

    if (/^#\S+$/.test(token)) {
      const tag = token.slice(1);

      if (!seenTags.has(tag)) {
        seenTags.add(tag);
        tags.push(tag);
      }

      continue;
    }

    titleTokens.push(token);
  }

  if (titleTokens.length === 0) {
    throw new TypeError('input must contain a title');
  }

  return {
    title: titleTokens.join(' '),
    tags,
    priority,
  };
}
