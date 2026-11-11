import type { AtcSessionId, AttemptId, AttemptRow, SpawnRequest, WorkerKind } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { buildMockV1AttemptRow } from '@boxxy/model/test-utils/build-mock-v1-attempt-row';
import invariant from 'tiny-invariant';

// What a worker adapter's test gives each case: the worker, and a spawn request on a target the
// test owns, for a new attempt ID each call.
export interface WorkerHarness {
  readonly worker: WorkerKind;
  buildSpawnRequest: (attempt: AttemptId) => SpawnRequest;
}

export interface WorkerContractOutcome {
  readonly received: unknown;
  readonly expected: unknown;
}

export type WorkerContractCase = readonly [
  title: string,
  check: (harness: WorkerHarness) => Promise<WorkerContractOutcome>,
];

// The behaviour of the worker port that dispatch relies on. Every adapter and the fake pass it.
export const workerContract: readonly WorkerContractCase[] = [
  [
    '#start starts a session that reads as running on the same atc session',
    async (harness) => {
      const attempt = await startAttempt(harness);
      const reading = await harness.worker.reconcile(attempt);

      return {
        received: [reading.kind, 'atcSession' in reading ? reading.atcSession : null],
        expected: ['running', attempt.atcSession],
      };
    },
  ],
  [
    '#start gives the same session for a second request with the same idempotency key',
    async (harness) => {
      const id = buildMockV1AttemptRow().id;
      const request = harness.buildSpawnRequest(id);

      const first = await harness.worker.start(request);
      const second = await harness.worker.start(request);

      return {
        received: findStartedSession(second),
        expected: findStartedSession(first),
      };
    },
  ],
  [
    '#reconcile reads absent for an attempt whose spawn never ran',
    async (harness) => {
      const id = buildMockV1AttemptRow().id;

      const reading = await harness.worker.reconcile(
        buildMockV1AttemptRow({
          id,
          atcSession: null,
          spawnRequest: { ...harness.buildSpawnRequest(id) },
        }),
      );

      return { received: reading, expected: { kind: 'absent' } };
    },
  ],
  [
    '#suspend answers active for a session with activity after the idle time',
    async (harness) => {
      const attempt = await startAttempt(harness);
      const outcome = await harness.worker.suspend(attempt, brandSchemas.instant.parse(0));

      return { received: outcome, expected: { kind: 'active' } };
    },
  ],
  [
    '#suspend with no idle check stops a running session, which then reads stopped',
    async (harness) => {
      const attempt = await startAttempt(harness);
      const outcome = await harness.worker.suspend(attempt, null);
      const reading = await harness.worker.reconcile(attempt);

      return {
        received: [outcome.kind, isStopped(reading.kind)],
        expected: ['suspended', true],
      };
    },
  ],
  [
    '#stop stops a running session, and a second stop is safe',
    async (harness) => {
      const attempt = await startAttempt(harness);
      const first = await harness.worker.stop(attempt);
      const second = await harness.worker.stop(attempt);
      const reading = await harness.worker.reconcile(attempt);

      return {
        received: [first.kind, second.kind, isStopped(reading.kind)],
        expected: ['stopped', 'stopped', true],
      };
    },
  ],
  [
    '#resume runs a stopped session again on the same atc session',
    async (harness) => {
      const attempt = await startAttempt(harness);

      await harness.worker.stop(attempt);

      const outcome = await harness.worker.resume(attempt);

      return { received: findStartedSession(outcome), expected: attempt.atcSession };
    },
  ],
  [
    '#forget removes a stopped session, and a second forget answers absent',
    async (harness) => {
      const attempt = await startAttempt(harness);

      const session = getSession(attempt);

      await harness.worker.stop(attempt);

      const first = await harness.worker.forget(session);
      const second = await harness.worker.forget(session);
      const reading = await harness.worker.reconcile(attempt);

      return {
        received: [first.kind, second.kind, reading.kind],
        expected: ['forgotten', 'absent', 'absent'],
      };
    },
  ],
  [
    '#resumeKept runs a stopped session again for a new attempt',
    async (harness) => {
      const first = await startAttempt(harness);

      const session = getSession(first);

      await harness.worker.stop(first);

      const second = buildMockV1AttemptRow().id;

      const outcome = await harness.worker.resumeKept(
        {
          atcSession: session,
          target: harness.buildSpawnRequest(first.id).target,
          attempt: first.id,
          keptAt: brandSchemas.instant.parse(0),
          caller: first.caller,
        },
        harness.buildSpawnRequest(second),
      );

      return { received: findStartedSession(outcome), expected: session };
    },
  ],
];

// An attempt row as the store holds it after the worker started its session.
async function startAttempt(harness: WorkerHarness): Promise<AttemptRow> {
  const id = buildMockV1AttemptRow().id;
  const request = harness.buildSpawnRequest(id);

  const outcome = await harness.worker.start(request);

  return buildMockV1AttemptRow({
    id,
    spawnRequest: { ...request },
    atcSession: findStartedSession(outcome),
    caller: outcome.kind === 'started' ? outcome.caller : null,
  });
}

function findStartedSession(
  outcome: Awaited<ReturnType<WorkerKind['start']>>,
): AtcSessionId | null {
  return outcome.kind === 'started' ? outcome.atcSession : null;
}

// a stop sleeps the host of an imp target, and ends the process of a local one
function isStopped(kind: string): boolean {
  return kind === 'suspended' || kind === 'ended';
}

function getSession(attempt: AttemptRow): AtcSessionId {
  invariant(attempt.atcSession !== null, 'the worker started a session');

  return attempt.atcSession;
}
