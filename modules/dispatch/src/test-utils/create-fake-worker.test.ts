import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { buildMockV1AttemptRow } from '@boxxy/model/test-utils/build-mock-v1-attempt-row';
import { createFakeClock } from './create-fake-clock.ts';
import { createFakeWorker } from './create-fake-worker.ts';
import { workerContract } from './worker-contract.ts';

function setupTest() {
  const clock = createFakeClock();
  const worker = createFakeWorker({ clock });

  return {
    clock,
    worker,
    harness: {
      worker,
      buildSpawnRequest: (attempt: ReturnType<typeof buildMockV1AttemptRow>['id']) => ({
        target: 'fake-target',
        cwd: '/tmp/boxxy-test/repo',
        prompt: 'Build the widget.',
        agent: 'claude',
        model: 'example-model',
        effort: 'medium' as const,
        name: `boxxy/${attempt}` as const,
        idempotencyKey: attempt,
      }),
    },
  };
}

test.each(workerContract)('it keeps the worker contract: %s', async (_title, check) => {
  const ctx = setupTest();

  const outcome = await check(ctx.harness);

  expect(outcome.received).toStrictEqual(outcome.expected);
});

test('it answers the next call of a method with the failure set for it, once', async () => {
  const ctx = setupTest();
  const attempt = buildMockV1AttemptRow();

  ctx.worker.failNext('start', { kind: 'unknown', reason: 'socket closed' });

  const first = await ctx.worker.start(ctx.harness.buildSpawnRequest(attempt.id));
  const second = await ctx.worker.start(ctx.harness.buildSpawnRequest(attempt.id));

  expect([first.kind, second.kind]).toStrictEqual(['unknown', 'started']);
});

test('it answers every call of a method with the failure set to stay', async () => {
  const ctx = setupTest();
  const attempt = buildMockV1AttemptRow();

  ctx.worker.failAlways('stop', { kind: 'unknown', reason: 'host_leased' });

  await ctx.worker.stop(attempt);

  const outcome = await ctx.worker.stop(attempt);

  expect(outcome).toStrictEqual({ kind: 'unknown', reason: 'host_leased' });
});

test('it reads the session a test set for an attempt with no atc session yet', async () => {
  const ctx = setupTest();
  const attempt = buildMockV1AttemptRow({ atcSession: null });

  ctx.worker.setSession(attempt.id, {
    state: 'running',
    attention: 'needs-input',
    lastActivityAt: brandSchemas.instant.parse(400),
    agentSession: null,
  });

  const reading = await ctx.worker.reconcile(attempt);

  expect(reading).toStrictEqual({
    kind: 'running',
    atcSession: brandSchemas.atcSessionId.parse('atc-1'),
    agentSession: null,
    caller: { issuer: 'fake-worker', subject: 'atc-1' },
    attention: 'needs-input',
    lastActivityAt: brandSchemas.instant.parse(400),
    lastOwnerAt: brandSchemas.instant.parse(1_000_000),
    usageLimitResetsAt: null,
  });
});

test('it records each call with the attempt it was for', async () => {
  const ctx = setupTest();
  const attempt = buildMockV1AttemptRow();

  await ctx.worker.reconcile(attempt);

  expect(ctx.worker.calls).toStrictEqual([{ method: 'reconcile', subject: attempt.id }]);
});
