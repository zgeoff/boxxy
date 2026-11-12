import { WringerError } from '@wringer/core';

// Fails with `check-failed`, naming both values, when they differ.
export function expectEqual(label: string, actual: unknown, expected: unknown): void {
  if (!Bun.deepEquals(actual, expected, true)) {
    throw new WringerError('check-failed', {
      message: `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    });
  }
}
