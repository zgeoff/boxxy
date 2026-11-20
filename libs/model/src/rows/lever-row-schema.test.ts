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
    head: null,
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

test('it accepts a sign-off lever that names the head the owner read', () => {
  const row = {
    seq: 4,
    kind: 'signoff.send-back',
    item: '0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77',
    until: null,
    expiresAt: null,
    reason: 'The new rule contradicts the old one',
    phase: null,
    head: '3f9c1d2e4a5b6c7d8e9f00112233445566778899',
    actor: 'boxxy:owner:local',
    at: 1000,
  };

  const parsed: unknown = leverRowSchema.safeParse(row).data;

  expect(parsed).toStrictEqual(row);
});
