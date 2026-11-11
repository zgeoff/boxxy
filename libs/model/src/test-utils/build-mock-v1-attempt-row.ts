import { contentHash } from '@boxxy/content-hash';
import { faker } from '@faker-js/faker';
import { brandSchemas } from '../rows/brand-schemas.ts';
import type { AttemptRow } from '../types.ts';

const hashOptions = { length: 64, casing: 'lower', prefix: '' } as const;

// A running agent-mode build attempt of round 1. `buildMockAttemptRow` still builds the slice 1
// row that the store reads and writes.
export function buildMockV1AttemptRow(overrides: Partial<AttemptRow> = {}): AttemptRow {
  const spawnRequest =
    overrides.spawnRequest === undefined
      ? { prompt: faker.lorem.sentence() }
      : overrides.spawnRequest;

  return {
    id: brandSchemas.attemptId.parse(faker.string.uuid({ version: 7 })),
    item: brandSchemas.itemId.parse(faker.string.uuid({ version: 7 })),
    phase: brandSchemas.phaseName.parse('build'),
    number: 1,
    runner: brandSchemas.runnerId.parse('runner-1'),
    recipeHash: brandSchemas.recipeHash.parse(faker.string.hexadecimal(hashOptions)),
    rulesVersion: brandSchemas.rulesVersion.parse(faker.string.hexadecimal(hashOptions)),
    pool: brandSchemas.poolName.parse('main'),
    leaseGen: 1,
    spawnRequest,
    spawnRequestHash: contentHash(spawnRequest),
    state: 'running',
    failure: null,
    atcSession: brandSchemas.atcSessionId.parse(faker.string.uuid()),
    caller: null,
    claimedAt: brandSchemas.instant.parse(faker.number.int({ max: 1_800_000_000_000 })),
    startedAt: brandSchemas.instant.parse(faker.number.int({ max: 1_800_000_000_000 })),
    endedAt: null,
    fields: {},
    mode: 'agent',
    round: 1,
    input: {},
    holdGen: 1,
    closeOut: null,
    closeOutHash: null,
    closeOutFact: null,
    closing: null,
    closingAt: null,
    suspendRequestedAt: null,
    sleptAt: null,
    wakeRequestedAt: null,
    wokenAt: null,
    outcome: null,
    returnedOutcome: null,
    strayedAt: null,
    sessionStoppedAt: null,
    sessionForgottenAt: null,
    ...overrides,
  };
}
