function assertFiniteNumber(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`Expected a finite number, got ${value}`);
  }
}

export function add(a, b) {
  assertFiniteNumber(a);
  assertFiniteNumber(b);
  return a + b;
}

export function subtract(a, b) {
  assertFiniteNumber(a);
  assertFiniteNumber(b);
  return a - b;
}

export function multiply(a, b) {
  assertFiniteNumber(a);
  assertFiniteNumber(b);
  return a * b;
}

export function divide(a, b) {
  assertFiniteNumber(a);
  assertFiniteNumber(b);
  if (b === 0) {
    throw new RangeError('Division by zero');
  }
  return a / b;
}
