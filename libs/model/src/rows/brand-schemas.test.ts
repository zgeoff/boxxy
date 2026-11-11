import { expect, test } from 'bun:test';
import { brandSchemas } from './brand-schemas.ts';

test.each([
  ['itemId', '0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77'],
  ['factId', '0192f0c5-3c4d-7e5f-a061-7b8c9d0e1f2a'],
  ['runnerId', 'runner-1'],
  ['repoName', 'acme/widgets'],
  ['criterionId', 'a12'],
  ['commitSha', 'e83c5163316f89bfbde7d9ab23ca2e25604af290'],
  ['instant', 1_762_300_000_000],
] as const)('it accepts the %s %p', (brand, value) => {
  const built: unknown = brandSchemas[brand].safeParse(value).data;

  expect(built).toBe(value);
});

test.each([
  ['itemId', '0192F0C4-7B1E-7A10-9D55-3F2A1C0E9B77', 'invalid_format'],
  ['itemId', '4136cd0b-d90b-4af7-b485-5d1ded8db252', 'invalid_format'],
  ['factId', 'manual:0192f0c5-3c4d-7e5f-a061-7b8c9d0e1f2a', 'invalid_format'],
  ['factId', '4136cd0b-d90b-4af7-b485-5d1ded8db252', 'invalid_format'],
  ['runnerId', 'Runner 1', 'invalid_format'],
  ['repoName', 'widgets', 'invalid_format'],
  ['criterionId', 'a0', 'invalid_format'],
  ['commitSha', 'e83c516', 'invalid_format'],
  ['instant', -1, 'too_small'],
  ['instant', 1.5, 'invalid_type'],
] as const)('it rejects as a %s the value %p with %s', (brand, value, code) => {
  expect(brandSchemas[brand].safeParse(value).error?.issues).toPartiallyContain({ code });
});
