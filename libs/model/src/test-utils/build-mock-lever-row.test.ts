import { expect, test } from 'bun:test';
import { buildMockLeverRow } from './build-mock-lever-row.ts';

test('it builds a default lever row', () => {
  const built: unknown = buildMockLeverRow();

  expect(built).toStrictEqual({
    seq: expect.any(Number),
    kind: 'plan.defer',
    item: expect.stringMatching(/^[0-9a-f-]{36}$/u),
    until: null,
    expiresAt: null,
    reason: expect.any(String),
    actor: 'boxxy:owner:local',
    at: expect.any(Number),
  });
});

test('it applies overrides on top of the defaults', () => {
  const lever = buildMockLeverRow({ kind: 'item.retry', reason: null });

  expect(lever).toStrictEqual(expect.objectContaining({ kind: 'item.retry', reason: null }));
});
