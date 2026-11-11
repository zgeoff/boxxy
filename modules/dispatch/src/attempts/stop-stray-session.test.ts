import { expect, test } from 'bun:test';
import type { AttemptRow, WorkerKind } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import invariant from 'tiny-invariant';
import { closeOutAttempt } from '../closeouts/close-out-attempt.ts';
import { createTestDispatch } from '../test-utils/create-test-dispatch.ts';
import { stopStraySession } from './stop-stray-session.ts';

async function setupTest() {
  const dispatch = await createTestDispatch();

  return {
    ...dispatch,

    // a design attempt that closed out, whose session did not stop, and that the give-up rule
    // settled as a stray
    createStrayAttempt: async (): Promise<AttemptRow> => {
      const item = await dispatch.seedItem({
        phase: brandSchemas.phaseName.parse('design'),
        designMode: 'attended',
      });

      const claim = await dispatch.claim();

      invariant(claim?.attempt.item === item, 'the claim picks the seeded item');

      const attempt = await dispatch.readAttempt(claim.attempt.id);

      await closeOutAttempt({
        store: dispatch.store,
        call: dispatch.buildCallRef(attempt),
        body: {
          result: { kind: 'designed', design: { summary: 'Follow the theme.', location: null } },
          friction: [],
        },
        rules: dispatch.rules(),
        now: dispatch.clock.now(),
        newId: dispatch.newId,
      });

      dispatch.worker.failAlways('stop', { kind: 'unknown', reason: 'host_leased' });
      dispatch.clock.advance(10 * 60_000 + 1);

      await dispatch.tick();

      return dispatch.readAttempt(attempt.id);
    },
    stop: (attempt: AttemptRow, worker: WorkerKind) =>
      stopStraySession({
        store: dispatch.store,
        worker,
        attempt,
        actor: `boxxy:runner:${dispatch.runner}`,
        now: dispatch.clock.now(),
        newId: dispatch.newId,
      }),
  };
}

test('it records the stop of a stray session once the worker stops it', async () => {
  const ctx = await setupTest();
  const stray = await ctx.createStrayAttempt();

  const stopping: WorkerKind = { ...ctx.worker, stop: () => Promise.resolve({ kind: 'stopped' }) };

  const result = await ctx.stop(stray, stopping);
  const after = await ctx.readAttempt(stray.id);

  expect(result).toStrictEqual({ kind: 'applied' });
  expect(after.sessionStoppedAt).toBe(ctx.clock.now());
});

test('it records nothing while the stray session does not stop', async () => {
  const ctx = await setupTest();
  const stray = await ctx.createStrayAttempt();
  const result = await ctx.stop(stray, ctx.worker);
  const after = await ctx.readAttempt(stray.id);

  expect([stray.strayedAt !== null, result, after]).toStrictEqual([true, null, stray]);
});
