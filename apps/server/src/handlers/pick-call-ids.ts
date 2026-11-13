export interface CallIDs {
  readonly item?: string;
  readonly attempt?: string;
}

// The item and attempt IDs that a call's raw input names, for the log line of a failed call. No
// other field leaves the input, so a log line never holds a body or a token.
export function pickCallIDs(input: unknown): CallIDs {
  const item = findText(input, 'item');
  const session = findField(input, 'session');
  const attempt = findText(input, 'attempt') ?? findText(session, 'attempt');

  return {
    ...(item !== undefined && { item }),
    ...(attempt !== undefined && { attempt }),
  };
}

function findText(value: unknown, key: string): string | undefined {
  const field = findField(value, key);

  return typeof field === 'string' ? field : undefined;
}

function findField(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null && Object.hasOwn(value, key)
    ? Reflect.get(value, key)
    : undefined;
}
