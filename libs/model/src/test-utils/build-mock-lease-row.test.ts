import { expect, test } from 'bun:test';
import { buildMockLeaseRow } from './build-mock-lease-row.ts';

test('it builds a default lease row', () => {
  const built: unknown = buildMockLeaseRow();

  expect(built).toStrictEqual({
    item: expect.stringMatching(/^[0-9a-f-]{36}$/u),
    phase: 'build',
    attempt: expect.stringMatching(/^[0-9a-f-]{36}$/u),
    gen: 1,
    takenAt: expect.any(Number),
    releasedAt: null,
  });
});

test('it applies overrides on top of the defaults', () => {
  const lease = buildMockLeaseRow({ gen: 3 });

  expect(lease).toStrictEqual(expect.objectContaining({ gen: 3 }));
});
