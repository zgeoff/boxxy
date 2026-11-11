import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { buildMockV1AttemptRow } from '@boxxy/model/test-utils/build-mock-v1-attempt-row';
import { buildMockNewId } from '../test-utils/build-mock-new-id.ts';
import { endItemAttempts } from './end-item-attempts.ts';

function setupTest() {
  return {
    end: (attempts: Parameters<typeof endItemAttempts>[0]['attempts']) =>
      endItemAttempts({
        attempts,
        actor: 'boxxy:owner:local',
        now: brandSchemas.instant.parse(5000),
        newId: buildMockNewId(),
      }),
  };
}

test('#endItemAttempts settles a sleeping attempt at once as item-closed and lost', () => {
  const ctx = setupTest();
  const attempt = buildMockV1AttemptRow({ state: 'sleeping' });
  const ended = ctx.end([attempt]);

  expect(ended.ended).toStrictEqual([{ attempt: attempt.id, how: 'settled' }]);

  expect(ended.facts.map((fact) => [fact.type, fact.payload])).toMatchObject([
    ['boxxy.attempt.settled', { state: 'failed', failure: 'item-closed', outcome: 'lost' }],
  ]);
});

test('#endItemAttempts moves a running attempt to closing, under its lease', () => {
  const ctx = setupTest();
  const attempt = buildMockV1AttemptRow({ state: 'running' });
  const ended = ctx.end([attempt]);

  expect([ended.ended, ended.under]).toStrictEqual([
    [{ attempt: attempt.id, how: 'closing' }],
    { item: attempt.item, phase: attempt.phase, gen: attempt.leaseGen, holdGen: attempt.holdGen },
  ]);
});

test('#endItemAttempts leaves a closing attempt and a settled one alone', () => {
  const ctx = setupTest();

  const ended = ctx.end([
    buildMockV1AttemptRow({ state: 'closing', closing: 'closed-out' }),
    buildMockV1AttemptRow({ state: 'succeeded' }),
  ]);

  expect(ended).toStrictEqual({ under: null, writes: [], facts: [], ended: [] });
});
