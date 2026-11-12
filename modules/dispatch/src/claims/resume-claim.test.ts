import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import invariant from 'tiny-invariant';
import { createTestDispatch } from '../test-utils/create-test-dispatch.ts';
import { claimNext } from './claim-next.ts';
import { requestWake } from './request-wake.ts';
import { resumeClaim } from './resume-claim.ts';

async function setupTest() {
  const dispatch = await createTestDispatch();

  return {
    ...dispatch,
    claimWake: async () => {
      const item = await dispatch.seedItem({
        phase: brandSchemas.phaseName.parse('design'),
        designMode: 'attended',
      });

      const started = await dispatch.claim();

      invariant(started?.attempt.item === item, 'the claim starts the seeded item');

      dispatch.worker.setSession(started.attempt.id, { state: 'suspended', asked: true });

      await dispatch.tick();

      await requestWake({
        store: dispatch.store,
        attempt: started.attempt.id,
        by: 'command',
        actor: 'boxxy:owner:local',
        now: dispatch.clock.now(),
        newId: dispatch.newId,
      });

      const claim = await claimNext({
        store: dispatch.store,
        runner: dispatch.runner,
        rules: dispatch.rules(),
        now: dispatch.clock.now(),
        newId: dispatch.newId,
        backoff: dispatch.backoff,
        spawn: dispatch.spawn,
      });

      invariant(claim?.kind === 'wake', 'the claim wakes the sleeping attempt');

      return claim;
    },
    resume: (claim: Parameters<typeof resumeClaim>[0]['claim']) =>
      resumeClaim({
        store: dispatch.store,
        worker: dispatch.worker,
        claim,
        now: dispatch.clock.now(),
        newId: dispatch.newId,
        backoff: dispatch.backoff,
      }),
  };
}

test.each([
  ['capacity', 'host_unavailable (ram_budget_exceeded): no free slot'],
  ['other', 'auth_signin_needed: the target needs a sign-in'],
] as const)('it returns a wake refused for %s, with its reason', async (cause, reason) => {
  const ctx = await setupTest();
  const claim = await ctx.claimWake();

  ctx.worker.failNext('resume', { kind: 'refused', cause, reason });

  const refusal = await ctx.resume(claim);

  expect(refusal).toStrictEqual({
    kind: 'fault',
    fault: 'wake-refused',
    attempt: claim.attempt.id,
    item: claim.attempt.item,
    cause,
    reason,
  });
});
