import { expect, test } from 'bun:test';
import type { BuildCloseOut } from '../closeouts/types.ts';
import { buildMockV1AttemptRow } from '../test-utils/build-mock-v1-attempt-row.ts';
import { attemptSummarySchema } from './attempt-summary-schema.ts';
import { brandSchemas } from './brand-schemas.ts';
import { toAttemptSummary } from './to-attempt-summary.ts';

test('it drops the launch prompt and the input from an attempt row', () => {
  const row = buildMockV1AttemptRow({
    spawnRequest: { prompt: 'a very long launch prompt' },
    input: { acceptance: ['a very long input'] },
    state: 'failed',
    failure: 'spawn-failed',
  });

  const summary = toAttemptSummary(row);

  expect(JSON.stringify(summary)).not.toContain('very long');
});

test('it keeps the scalars that show the history of an item', () => {
  const phase = brandSchemas.phaseName.parse('build');
  const claimedAt = brandSchemas.instant.parse(1000);
  const startedAt = brandSchemas.instant.parse(2000);
  const endedAt = brandSchemas.instant.parse(3000);

  const row = buildMockV1AttemptRow({
    phase,
    number: 2,
    state: 'failed',
    failure: 'timed-out',
    claimedAt,
    startedAt,
    endedAt,
  });

  const summary = toAttemptSummary(row);

  expect(summary).toStrictEqual({
    id: row.id,
    item: row.item,
    phase,
    number: 2,
    round: row.round,
    mode: row.mode,
    state: 'failed',
    failure: 'timed-out',
    refusal: null,
    pool: row.pool,
    runner: row.runner,
    atcSession: row.atcSession,
    claimedAt,
    startedAt,
    endedAt,
    outcome: null,
  });
});

test('it builds a summary that the summary schema accepts', () => {
  const summary = toAttemptSummary(buildMockV1AttemptRow());

  expect(attemptSummarySchema.safeParse(summary).data).toStrictEqual(summary);
});

test('it gives no outcome for a skipped attempt, which has no close-out', () => {
  const row = buildMockV1AttemptRow({
    state: 'succeeded',
    outcome: 'skipped',
    closeOut: null,
  });

  expect(toAttemptSummary(row).outcome).toBeNull();
});

test('it gives the outcome name of a close-out that is not settled yet', () => {
  const closeOut: BuildCloseOut = {
    result: { kind: 'built' },
    criteria: [],
    openItems: [],
    friction: [],
    frictionDropped: 0,
  };

  const row = buildMockV1AttemptRow({ state: 'closing', outcome: null, closeOut });

  expect(toAttemptSummary(row).outcome).toBe(brandSchemas.outcomeName.parse('built'));
});
