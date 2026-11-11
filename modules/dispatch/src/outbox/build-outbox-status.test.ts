import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { buildInitialSenderState } from './build-initial-sender-state.ts';
import { buildOutboxStatus } from './build-outbox-status.ts';

function setupTest() {
  return {
    now: brandSchemas.instant.parse(1_800_000_000_000),
    none: { unsent: 0, parked: 0, oldestUnsentAt: null },
  };
}

test('it reports an idle sender with nothing unsent', () => {
  const ctx = setupTest();

  expect(
    buildOutboxStatus({
      sink: 'pepys',
      state: buildInitialSenderState(),
      counts: ctx.none,
      now: ctx.now,
      isSending: false,
    }),
  ).toStrictEqual({
    sink: 'pepys',
    state: 'idle',
    unsent: 0,
    parked: 0,
    lag: null,
    failingSince: null,
    nextTryAt: null,
    lastError: null,
    lastStoredAt: null,
  });
});

test('it reports the lag as whole minutes since the oldest unsent row', () => {
  const ctx = setupTest();
  const oldestUnsentAt = brandSchemas.instant.parse(ctx.now - 24 * 3_600_000 - 3 * 60_000 - 59_000);

  const status = buildOutboxStatus({
    sink: 'pepys',
    state: buildInitialSenderState(),
    counts: { unsent: 6240, parked: 2, oldestUnsentAt },
    now: ctx.now,
    isSending: false,
  });

  expect([status.unsent, status.parked, status.lag]).toStrictEqual([6240, 2, 1443]);
});

test('it reports off when there is no sink, whatever the sender state says', () => {
  const ctx = setupTest();
  const state = { ...buildInitialSenderState(), phase: 'blocked' as const };

  expect(
    buildOutboxStatus({ sink: 'none', state, counts: ctx.none, now: ctx.now, isSending: false })
      .state,
  ).toBe('off');
});

test('it reports sending while a batch is in flight', () => {
  const ctx = setupTest();

  expect(
    buildOutboxStatus({
      sink: 'pepys',
      state: buildInitialSenderState(),
      counts: ctx.none,
      now: ctx.now,
      isSending: true,
    }).state,
  ).toBe('sending');
});

test('it reports the phase of a sender that backs off', () => {
  const ctx = setupTest();
  const state = { ...buildInitialSenderState(), phase: 'backing-off' as const };

  expect(
    buildOutboxStatus({ sink: 'pepys', state, counts: ctx.none, now: ctx.now, isSending: false })
      .state,
  ).toBe('backing-off');
});
