import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { buildMockV1AttemptRow } from '@boxxy/model/test-utils/build-mock-v1-attempt-row';
import { isSameGuard } from './is-same-guard.ts';

test('it accepts a row whose guard columns match the row the caller decided on', () => {
  const row = buildMockV1AttemptRow({ state: 'running', holdGen: 2 });

  expect(isSameGuard(row, { ...row, endedAt: null })).toBeTrue();
});

test('it refuses a row that was woken again since the caller read it', () => {
  const seen = buildMockV1AttemptRow({ state: 'waking', holdGen: 1 });

  expect(isSameGuard(seen, { ...seen, holdGen: 2 })).toBeFalse();
});

test('it refuses a row whose session was recorded since the caller read it', () => {
  const seen = buildMockV1AttemptRow({ state: 'starting', atcSession: null });
  const row = { ...seen, atcSession: brandSchemas.atcSessionId.parse('atc-7') };

  expect(isSameGuard({ atcSession: null }, row)).toBeFalse();
});

test('it refuses a job row that another read marked since the caller read it', () => {
  const seen = buildMockV1AttemptRow({ state: 'running' });
  const marked = brandSchemas.instant.parse(30_000);
  const row = { ...seen, readAt: marked, actedAt: marked };

  expect(isSameGuard({ readAt: seen.readAt, actedAt: seen.actedAt }, row)).toBeFalse();
});

test('it checks only the columns a caller names', () => {
  const row = buildMockV1AttemptRow({ state: 'closing', closing: 'item-closed', atcSession: null });

  expect(isSameGuard({ atcSession: null }, row)).toBeTrue();
});
