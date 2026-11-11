import { expect, test } from 'bun:test';
import type { CallerIdentity } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { buildMockV1AttemptRow } from '@boxxy/model/test-utils/build-mock-v1-attempt-row';
import invariant from 'tiny-invariant';
import { closeOutAttempt } from '../closeouts/close-out-attempt.ts';
import { createTestDispatch } from '../test-utils/create-test-dispatch.ts';
import { pickCallAttempt } from './pick-call-attempt.ts';

async function setupTest() {
  const dispatch = await createTestDispatch();

  return {
    ...dispatch,
    findSessionByCaller: (caller: CallerIdentity) =>
      dispatch.store.read((tx) => tx.findSessionByCaller(caller)),
  };
}

test('#pickCallAttempt refuses a session that carries no attempt', () => {
  const attempt = buildMockV1AttemptRow();

  const answer = pickCallAttempt(null, {
    attempt: attempt.id,
    session: brandSchemas.atcSessionId.parse('atc-9'),
    caller: { issuer: 'https://issuer.example.test', subject: 'atc-9' },
  });

  expect(answer).toStrictEqual({ kind: 'refused', reason: 'no-attempt' });
});

test('#pickCallAttempt refuses a call that names an attempt other than the latest of the session', () => {
  const caller = { issuer: 'https://issuer.example.test', subject: 'session-4' };
  const latest = buildMockV1AttemptRow({ caller });
  const other = buildMockV1AttemptRow({ caller });

  invariant(latest.atcSession !== null, 'the mock attempt started');

  const answer = pickCallAttempt(latest, { attempt: other.id, session: latest.atcSession, caller });

  expect(answer).toStrictEqual({ kind: 'refused', reason: 'not-current' });
});

test('#pickCallAttempt refuses the latest attempt when it holds another caller', () => {
  const latest = buildMockV1AttemptRow();

  invariant(latest.atcSession !== null, 'the mock attempt started');

  const answer = pickCallAttempt(latest, {
    attempt: latest.id,
    session: latest.atcSession,
    caller: { issuer: 'https://issuer.example.test', subject: 'someone-else' },
  });

  expect(answer).toStrictEqual({ kind: 'refused', reason: 'no-attempt' });
});

test('#pickCallAttempt gives the latest attempt when it holds the proven caller', () => {
  const latest = buildMockV1AttemptRow({
    caller: { issuer: 'https://issuer.example.test', subject: 'session-4' },
  });

  invariant(latest.atcSession !== null, 'the mock attempt started');

  const answer = pickCallAttempt(latest, {
    attempt: latest.id,
    session: latest.atcSession,
    caller: { issuer: 'https://issuer.example.test', subject: 'session-4' },
  });

  expect(answer).toStrictEqual({ kind: 'attempt', attempt: latest });
});

test('it refuses a call for the second attempt of a kept session while that attempt holds no caller', async () => {
  const ctx = await setupTest();
  const rework = await ctx.seedRework({ keptCaller: null });

  const caller = rework.first.caller;

  invariant(caller !== null && rework.second.atcSession !== null, 'the first build ran');

  const session = await ctx.findSessionByCaller(caller);

  const answer = await closeOutAttempt({
    store: ctx.store,
    call: { attempt: rework.second.id, session: rework.second.atcSession, caller },
    body: rework.firstBody,
    rules: ctx.rules(),
    now: ctx.clock.now(),
    newId: ctx.newId,
  });

  const closedOut = await ctx.listFacts('boxxy.attempt.closed_out');

  expect([session, answer]).toStrictEqual([null, { kind: 'refused', reason: 'no-attempt' }]);
  expect(closedOut).toHaveLength(2);
});

test('it gives the second attempt of a kept session the caller of the first at the claim', async () => {
  const ctx = await setupTest();
  const rework = await ctx.seedRework({});

  expect(rework.claimed.caller).toStrictEqual(rework.first.caller);
});
