import { expect, test } from 'bun:test';
import { buildMockV1LeverRow } from './build-mock-v1-lever-row.ts';

test('it builds a defer lever with no phase', () => {
  const built: unknown = buildMockV1LeverRow();

  expect(built).toStrictEqual({
    seq: expect.any(Number),
    kind: 'plan.defer',
    item: expect.stringMatching(/^[0-9a-f-]{36}$/u),
    until: null,
    expiresAt: null,
    reason: expect.any(String),
    phase: null,
    actor: 'boxxy:owner:local',
    at: expect.any(Number),
  });
});

test('it applies overrides on top of the defaults', () => {
  const lever = buildMockV1LeverRow({ kind: 'item.retry', reason: null });

  expect(lever).toStrictEqual(expect.objectContaining({ kind: 'item.retry', reason: null }));
});
