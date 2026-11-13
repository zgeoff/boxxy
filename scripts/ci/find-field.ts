// One field of a value parsed from JSON, or undefined when the value is no object or lacks it.
export function findField(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }

  const entries: Record<string, unknown> = Object.fromEntries(Object.entries(value));

  return entries[key];
}
