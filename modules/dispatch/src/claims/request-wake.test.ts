import { expect, test } from 'bun:test';
import type { AttemptRow } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import invariant from 'tiny-invariant';
import { createTestDispatch } from '../test-utils/create-test-dispatch.ts';
import { requestWake } from './request-wake.ts';

async function setupTest() {
  const dispatch = await createTestDispatch();

  return {
    ...dispatch,
    claimSleeping: async () => {
      const item = await dispatch.seedItem({
        phase: brandSchemas.phaseName.parse('design'),
        designMode: 'attended',
      });

      const claim = await dispatch.claim();

      invariant(claim?.attempt.item === item, 'the claim picks the seeded item');

      dispatch.worker.setSession(claim.attempt.id, {
        state: 'running',
        attention: 'needs-input',
        lastActivityAt: dispatch.clock.now(),
      });

      dispatch.clock.advance(31 * 60_000);

      await dispatch.tick();

      return dispatch.readAttempt(claim.attempt.id);
    },
    wake: (attempt: AttemptRow) =>
      requestWake({
        store: dispatch.store,
        attempt: attempt.id,
        by: 'command',
        actor: 'boxxy:owner:local',
        now: dispatch.clock.now(),
        newId: dispatch.newId,
      }),
  };
}

test('it records the wake request of a sleeping attempt once', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.claimSleeping();
  const first = await ctx.wake(attempt);
  const second = await ctx.wake(attempt);
  const requested = await ctx.listFacts('boxxy.attempt.wake_requested');

  expect([attempt.state, first, second]).toStrictEqual([
    'sleeping',
    { kind: 'applied' },
    { kind: 'not-allowed' },
  ]);

  expect(requested).toHaveLength(1);
});
