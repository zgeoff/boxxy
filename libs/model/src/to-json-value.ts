import type { JsonValue } from '@boxxy/content-hash';
import invariant from 'tiny-invariant';

export function toJsonValue(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'string'
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry: unknown) => toJsonValue(entry));
  }

  invariant(typeof value === 'object', `a ${typeof value} has no JSON form`);

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]: [string, unknown]) => entry !== undefined)
      .map(([key, entry]: [string, unknown]) => [key, toJsonValue(entry)]),
  );
}
