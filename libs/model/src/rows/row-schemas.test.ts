import { expect, test } from 'bun:test';
import { buildMockLeaseRow } from '../test-utils/build-mock-lease-row.ts';
import { buildMockRelationRow } from '../test-utils/build-mock-relation-row.ts';
import { buildMockV1AttemptRow } from '../test-utils/build-mock-v1-attempt-row.ts';
import { buildMockV1ItemRow } from '../test-utils/build-mock-v1-item-row.ts';
import { buildMockV1LeverRow } from '../test-utils/build-mock-v1-lever-row.ts';
import { buildMockV1PullRequestRow } from '../test-utils/build-mock-v1-pull-request-row.ts';
import { rowSchemas } from './row-schemas.ts';

test.each([
  ['items', () => rowSchemas.items.parse(buildMockV1ItemRow())],
  ['relations', () => rowSchemas.relations.parse(buildMockRelationRow())],
  ['levers', () => rowSchemas.levers.parse(buildMockV1LeverRow())],
  ['attempts', () => rowSchemas.attempts.parse(buildMockV1AttemptRow())],
  ['leases', () => rowSchemas.leases.parse(buildMockLeaseRow())],
  ['pull_requests', () => rowSchemas.pull_requests.parse(buildMockV1PullRequestRow())],
])('it parses a %s row that its factory builds', (_table, parse) => {
  expect(parse).not.toThrow();
});

test('it parses a runner row', () => {
  const row = { id: 'runner-1', heartbeatAt: 1000, paused: true };
  const parsed: unknown = rowSchemas.runners.parse(row);

  expect(parsed).toStrictEqual(row);
});

test('it parses an evidence row', () => {
  const row = {
    factId: '0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77',
    attempt: '0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b70',
    kind: 'pull_request',
    ref: 'https://github.com/acme/lamps/pull/7',
    observed: null,
    source: 'hook',
    at: 4000,
  };

  const parsed: unknown = rowSchemas.evidence.parse(row);

  expect(parsed).toStrictEqual(row);
});

test('it rejects a lease row with a negative gen', () => {
  const row = { ...buildMockLeaseRow(), gen: -1 };

  expect(() => rowSchemas.leases.parse(row)).toThrow();
});
