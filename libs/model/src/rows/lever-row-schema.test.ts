import { expect, test } from 'bun:test';
import { leverRowSchema } from './lever-row-schema.ts';

test('it accepts a retry lever that names a phase', () => {
  const row = {
    seq: 3,
    kind: 'item.retry',
    item: '0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77',
    until: null,
    expiresAt: null,
    reason: null,
    phase: 'build',
    actor: 'boxxy:owner:local',
    at: 1000,
  };

  const parsed: unknown = leverRowSchema.safeParse(row).data;

  expect(parsed).toStrictEqual(row);
});

test('it rejects a lever kind with no concept part', () => {
  expect(leverRowSchema.safeParse({ kind: 'retry' }).error?.issues).toPartiallyContain({
    path: ['kind'],
  });
});
