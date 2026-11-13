import { expect, test } from 'bun:test';
import type { AttemptRow } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import invariant from 'tiny-invariant';
import type { CallRef } from '../closeouts/types.ts';
import { createTestDispatch } from '../test-utils/create-test-dispatch.ts';
import { bindAttemptSession } from './bind-attempt-session.ts';

async function setupTest() {
  const dispatch = await createTestDispatch();

  return {
    ...dispatch,
    claimBuild: async (): Promise<AttemptRow> => {
      const item = await dispatch.seedItem({ phase: brandSchemas.phaseName.parse('build') });
      const claim = await dispatch.claim();

      invariant(claim?.attempt.item === item, 'the claim picks the seeded item');

      return dispatch.readAttempt(claim.attempt.id);
    },
    bind: (call: CallRef, missingSkills: readonly string[]) =>
      bindAttemptSession({
        store: dispatch.store,
        call,
        agentSession: brandSchemas.agentSessionId.parse('agent-from-hook'),
        missingSkills,
        now: dispatch.clock.now(),
        newId: dispatch.newId,
      }),
  };
}

test('it binds the agent session to the attempt of the calling session', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.claimBuild();
  const answer = await ctx.bind(ctx.buildCallRef(attempt), []);
  const bound = await ctx.listFacts('boxxy.attempt.session_bound');

  expect(answer).toStrictEqual({ kind: 'bound' });

  expect(bound.map((fact) => fact.payload)).toContainEqual(
    expect.objectContaining({ attempt: attempt.id, agentSession: 'agent-from-hook' }),
  );
});

test('it hands the agent session of a woken kept session to the rework that the hook binds', async () => {
  const ctx = await setupTest();
  const first = await ctx.seedBuild();
  const kept = await ctx.worker.reconcile(first);

  invariant(kept.kind !== 'absent' && kept.agentSession !== null, 'the session is kept');

  ctx.worker.setSession(first.id, { state: 'suspended', agentSession: null });

  const second = await ctx.seedReworkAfter(first);

  const answer = await bindAttemptSession({
    store: ctx.store,
    call: ctx.buildCallRef(second),
    agentSession: kept.agentSession,
    missingSkills: [],
    now: ctx.clock.now(),
    newId: ctx.newId,
  });

  expect(answer).toStrictEqual({ kind: 'bound' });
});

test('it moves the attempt to closing when a listed skill is missing', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.claimBuild();
  const answer = await ctx.bind(ctx.buildCallRef(attempt), ['code-style']);
  const after = await ctx.readAttempt(attempt.id);

  expect(answer).toStrictEqual({ kind: 'skill-missing' });
  expect([after.state, after.closing]).toStrictEqual(['closing', 'skill-missing']);
});

test('it refuses a call that names another attempt and writes nothing', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.claimBuild();

  const other = brandSchemas.attemptId.parse(ctx.newId());

  const answer = await ctx.bind({ ...ctx.buildCallRef(attempt), attempt: other }, ['code-style']);
  const after = await ctx.readAttempt(attempt.id);

  expect(answer).toStrictEqual({ kind: 'not-current' });
  expect(after).toStrictEqual(attempt);
});

test('it refuses a caller that the attempt does not hold', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.claimBuild();

  const call = ctx.buildCallRef(attempt);

  const answer = await ctx.bind({ ...call, caller: { ...call.caller, subject: 'another' } }, []);
  const bound = await ctx.listFacts('boxxy.attempt.session_bound');

  expect(answer).toStrictEqual({ kind: 'no-attempt' });

  expect(bound.map((fact) => fact.payload)).not.toContainEqual(
    expect.objectContaining({ agentSession: 'agent-from-hook' }),
  );
});
