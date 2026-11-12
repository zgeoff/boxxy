// `String(error)` drops the inner errors of an AggregateError and the cause, which hold the
// SQLite error of a failed rollback. The line carries no stack and no other field.
export function formatErrorChain(error: unknown): string {
  return formatLink(error, new Set());
}

function formatLink(error: unknown, seen: Set<unknown>): string {
  if (!(error instanceof Error)) {
    return String(error);
  }

  if (seen.has(error)) {
    return '(the same error again)';
  }

  seen.add(error);

  const inner: readonly unknown[] = error instanceof AggregateError ? error.errors : [];
  const cause = error.cause === undefined || inner.includes(error.cause) ? [] : [error.cause];

  const parts = [
    formatHead(error),
    ...inner.map((each) => `[${formatLink(each, seen)}]`),
    ...cause.map((each) => `(cause: ${formatLink(each, seen)})`),
  ];

  return parts.join(' ');
}

function formatHead(error: Error): string {
  const code = 'code' in error && typeof error.code === 'string' ? ` ${error.code}` : '';

  return `${error.name}${code}: ${error.message}`;
}
