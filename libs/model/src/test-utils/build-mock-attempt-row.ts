import { contentHash } from '@boxxy/content-hash';
import { faker } from '@faker-js/faker';
import { brandSchemas } from '../brand-schemas.ts';
import type { AttemptRow } from '../types/core.ts';

const hashOptions = { length: 64, casing: 'lower', prefix: '' } as const;

export function buildMockAttemptRow(overrides: Partial<AttemptRow> = {}): AttemptRow {
  const spawnRequest = overrides.spawnRequest ?? { prompt: faker.lorem.sentence() };

  return {
    id: brandSchemas.attemptId.parse(faker.string.uuid({ version: 7 })),
    item: brandSchemas.itemId.parse(faker.string.uuid({ version: 7 })),
    phase: brandSchemas.phaseName.parse('build'),
    number: 1,
    runner: brandSchemas.runnerId.parse('runner-1'),
    recipeHash: brandSchemas.recipeHash.parse(faker.string.hexadecimal(hashOptions)),
    rulesVersion: brandSchemas.rulesVersion.parse(faker.string.hexadecimal(hashOptions)),
    pool: brandSchemas.poolName.parse('build'),
    slot: 1,
    slotGen: 1,
    leaseGen: 1,
    spawnRequest,
    spawnRequestHash: contentHash(spawnRequest),
    state: 'succeeded',
    failure: null,
    atcSession: brandSchemas.atcSessionId.parse(faker.string.uuid()),
    closeOut: null,
    claimedAt: brandSchemas.instant.parse(faker.number.int({ max: 1_800_000_000_000 })),
    startedAt: brandSchemas.instant.parse(faker.number.int({ max: 1_800_000_000_000 })),
    endedAt: brandSchemas.instant.parse(faker.number.int({ max: 1_800_000_000_000 })),
    ...overrides,
  };
}
