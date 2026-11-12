// Copied from atc: packages/core/src/is-record.ts at commit 4fe647cf.

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
