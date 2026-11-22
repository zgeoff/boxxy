import { expect, test } from 'bun:test';
import type { CheckReading, VerifyReading } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { pickVerdictRefusal } from './pick-verdict-refusal.ts';

function setupTest() {
  const head = brandSchemas.commitSha.parse('9c1e0f5a2b3c4d5e6f708192a3b4c5d6e7f80910');
  const passedGate: CheckReading = { state: 'success', source: 'check-run' };

  return {
    head,
    passedGate,
    verifiedWith: (names: readonly string[]): VerifyReading => ({
      status: 'verified',
      head,
      features: names.map((name) => ({ name, status: 'verified' as const })),
    }),
  };
}

test('it passes a feature that a passed gate lists as verified', () => {
  const ctx = setupTest();

  expect(
    pickVerdictRefusal('file-item', ctx.head, ctx.passedGate, ctx.verifiedWith(['file-item'])),
  ).toBeNull();
});

test('it refuses a verified reading without the feature as verdict-missing', () => {
  const ctx = setupTest();

  expect(
    pickVerdictRefusal('file-item', ctx.head, ctx.passedGate, ctx.verifiedWith([])),
  ).toStrictEqual({ reason: 'verdict-missing', feature: 'file-item', head: ctx.head });
});

test.each([
  { name: 'an absent gate', gate: undefined },
  { name: 'a pending gate', gate: { state: 'pending', source: 'check-run' } },
  {
    name: 'a gate that is only a commit status',
    gate: { state: 'success', source: 'commit-status' },
  },
] as const)('it refuses $name as verify-pending', (row) => {
  const ctx = setupTest();

  expect(
    pickVerdictRefusal('file-item', ctx.head, row.gate, ctx.verifiedWith(['file-item'])),
  ).toStrictEqual({ reason: 'verify-pending', feature: 'file-item', head: ctx.head });
});

test('it refuses a cancelled gate as verify-failed', () => {
  const ctx = setupTest();
  const gate: CheckReading = { state: 'other', source: 'check-run' };

  expect(
    pickVerdictRefusal('file-item', ctx.head, gate, ctx.verifiedWith(['file-item'])),
  ).toStrictEqual({ reason: 'verify-failed', feature: 'file-item', head: ctx.head });
});

test('it refuses an incomplete reading as verify-failed, with the verifier note', () => {
  const ctx = setupTest();
  const gate: CheckReading = { state: 'failure', source: 'check-run' };

  const reading: VerifyReading = {
    status: 'incomplete',
    head: ctx.head,
    features: [],
    note: 'no report',
  };

  expect(pickVerdictRefusal('file-item', ctx.head, gate, reading)).toStrictEqual({
    reason: 'verify-failed',
    feature: 'file-item',
    head: ctx.head,
    note: 'no report',
  });
});

test('it refuses an incomplete reading with no note as verify-failed with no note', () => {
  const ctx = setupTest();
  const reading: VerifyReading = { status: 'incomplete', head: ctx.head, features: [] };

  expect(pickVerdictRefusal('file-item', ctx.head, ctx.passedGate, reading)).toStrictEqual({
    reason: 'verify-failed',
    feature: 'file-item',
    head: ctx.head,
  });
});

test('it refuses a gate that passed but a reading that covers no head as verify-pending', () => {
  const ctx = setupTest();
  const reading: VerifyReading = { status: 'not-covered', head: ctx.head };

  expect(pickVerdictRefusal('file-item', ctx.head, ctx.passedGate, reading)).toStrictEqual({
    reason: 'verify-pending',
    feature: 'file-item',
    head: ctx.head,
  });
});
