import { expect, test } from 'bun:test';
import { buildMockAttemptRow } from '../test-utils/build-mock-attempt-row.ts';
import { buildMockItemRow } from '../test-utils/build-mock-item-row.ts';
import { buildMockLeaseRow } from '../test-utils/build-mock-lease-row.ts';
import { buildMockLeverRow } from '../test-utils/build-mock-lever-row.ts';
import { buildMockPullRequestRow } from '../test-utils/build-mock-pull-request-row.ts';
import { buildMockRelationRow } from '../test-utils/build-mock-relation-row.ts';
import { sliceOneRowSchemas } from './slice-one-row-schemas.ts';

test.each([
  ['items', () => sliceOneRowSchemas.items.parse(buildMockItemRow())],
  ['relations', () => sliceOneRowSchemas.relations.parse(buildMockRelationRow())],
  ['levers', () => sliceOneRowSchemas.levers.parse(buildMockLeverRow())],
  ['attempts', () => sliceOneRowSchemas.attempts.parse(buildMockAttemptRow())],
  ['leases', () => sliceOneRowSchemas.leases.parse(buildMockLeaseRow())],
  ['pull_requests', () => sliceOneRowSchemas.pull_requests.parse(buildMockPullRequestRow())],
])('it parses a %s row that its factory builds', (_table, parse) => {
  expect(parse).not.toThrow();
});

test('it parses a pool slot row', () => {
  const row = {
    pool: 'build',
    slot: 1,
    holder: '0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77',
    gen: 3,
    retired: false,
  };

  const parsed: unknown = sliceOneRowSchemas.pool_slots.parse(row);

  expect(parsed).toStrictEqual(row);
});

test('it parses a runner row', () => {
  const row = { id: 'runner-1', heartbeatAt: 1000, paused: true };
  const parsed: unknown = sliceOneRowSchemas.runners.parse(row);

  expect(parsed).toStrictEqual(row);
});

test('it rejects an attempt row in a state the store never writes', () => {
  const row = { ...buildMockAttemptRow(), state: 'paused' };

  expect(() => sliceOneRowSchemas.attempts.parse(row)).toThrow();
});

test('it rejects a pool slot row with a negative gen', () => {
  const row = { pool: 'build', slot: 1, holder: null, gen: -1, retired: false };

  expect(() => sliceOneRowSchemas.pool_slots.parse(row)).toThrow();
});

test('it parses an attempt session row', () => {
  const row = {
    attempt: '0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77',
    agentSession: 'agent-session-1',
    atcSession: 'atc-session-1',
    seenAt: 2500,
  };

  const parsed: unknown = sliceOneRowSchemas.attempt_sessions.parse(row);

  expect(parsed).toStrictEqual(row);
});
