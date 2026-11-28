import { expect, test } from 'bun:test';
import { brandSchemas } from '../rows/brand-schemas.ts';
import { buildMockCapacityRefusalRow } from './build-mock-capacity-refusal-row.ts';

test('it builds a default capacity refusal row', () => {
  const built: unknown = buildMockCapacityRefusalRow();

  expect(built).toStrictEqual({
    id: expect.stringMatching(/^[0-9a-f-]{36}$/u),
    attempt: expect.stringMatching(/^[0-9a-f-]{36}$/u),
    item: expect.stringMatching(/^[0-9a-f-]{36}$/u),
    phase: 'build',
    pool: 'main',
    at: expect.any(Number),
    refusal: null,
  });
});

test('it applies overrides on top of the defaults', () => {
  const row = buildMockCapacityRefusalRow({ pool: brandSchemas.poolName.parse('verify') });

  expect(row).toStrictEqual(expect.objectContaining({ pool: 'verify' }));
});
