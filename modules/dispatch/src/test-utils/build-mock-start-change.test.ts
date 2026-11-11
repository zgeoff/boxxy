import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { buildMockV1AttemptRow } from '@boxxy/model/test-utils/build-mock-v1-attempt-row';
import { buildMockStartChange } from './build-mock-start-change.ts';

test('it builds a change that moves a starting attempt to running with its caller', () => {
  const atcSession = brandSchemas.atcSessionId.parse('atc-session-1');
  const attempt = buildMockV1AttemptRow({ state: 'starting', leaseGen: 2, atcSession });
  const caller = { issuer: 'https://issuer.example', subject: 'worker-1' };
  const change: unknown = buildMockStartChange(attempt, caller);

  expect(change).toStrictEqual({
    at: 2500,
    under: { item: attempt.item, phase: attempt.phase, gen: 2 },
    writes: [
      {
        op: 'update',
        table: 'attempts',
        key: { id: attempt.id },
        expect: { state: 'starting' },
        set: { state: 'running', atcSession: 'atc-session-1', caller, startedAt: 2500 },
      },
    ],
    facts: [
      {
        id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-7/u),
        type: 'boxxy.attempt.started',
        entity: `boxxy:item:${attempt.item}`,
        actor: `boxxy:runner:${attempt.runner}`,
        payload: {
          attempt: attempt.id,
          atcSession: 'atc-session-1',
          resumeFallback: false,
          caller,
        },
      },
    ],
  });
});

test('it throws for an attempt with no atc session', () => {
  const attempt = buildMockV1AttemptRow({ state: 'starting', atcSession: null });

  expect(() => buildMockStartChange(attempt)).toThrow();
});
