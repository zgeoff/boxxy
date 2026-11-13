import {
  actOnReading,
  claimNext,
  forgetSessions,
  pickReadingAction,
  resumeClaim,
  runJobReading,
  sendNotices,
  startClaim,
  stopStraySession,
  timeouts,
} from '@boxxy/dispatch';
import type { JobFault, NoticeReport, SpawnSettings } from '@boxxy/dispatch';
import type {
  AttemptId,
  AttemptRow,
  CapacityBackoff,
  ClaimStore,
  Instant,
  ItemId,
  LoadedRules,
  NewId,
  Notifier,
  PipelineStep,
  RunnerFault,
  RunnerId,
  SessionReading,
  WorkerKind,
  WorkerKindName,
  WorkerRegistry,
  WorkerShape,
} from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import invariant from 'tiny-invariant';
import { match } from 'ts-pattern';
import { formatErrorChain } from '../format-error-chain.ts';
import type { NoticeStatus, ServerLog } from '../types.ts';

export interface TickDeps {
  readonly store: ClaimStore;
  readonly runner: RunnerId;

  // each worker the server built, by the name a phase kind gives
  readonly workers: WorkerRegistry;
  readonly rules: LoadedRules;
  readonly backoff: CapacityBackoff;
  readonly spawn: SpawnSettings;
  readonly notifier: Notifier;

  // one value for the whole tick
  readonly now: Instant;
  readonly newId: NewId;

  // the last reading of each live attempt; the tick replaces it whole
  readonly readings: Map<AttemptId, SessionReading>;
  readonly noticeStatus: NoticeStatus;
  readonly log: ServerLog;
}

export interface TickReport {
  readonly claimed: number;
  readonly read: number;
  readonly strays: number;
  readonly forgotten: number;
  readonly notices: NoticeReport | null;
}

// One tick of the runner. Each part after the heartbeat runs even when an earlier part threw, so
// a fault in the claim loop never holds the readings back.
export async function runTick(deps: TickDeps): Promise<TickReport> {
  await deps.store.exclusive(async (tx) => {
    await tx.writeHeartbeat(deps.runner, deps.now);
    await tx.syncLimits(deps.rules.limits, deps.now);
  });

  const claimed = await runClaimLoop(deps);
  const read = await runReadings(deps);
  const strays = await runStrayStops(deps);
  const forgotten = await runForget(deps);
  const notices = await runNotices(deps);

  return { claimed, read, strays, forgotten, notices };
}

// The claim loop ends on three rules: `claimNext` gives no pick in a pool in backoff, it gives no
// pick of an item that the tick claimed already, and an error ends the loop and not the tick.
async function runClaimLoop(deps: TickDeps): Promise<number> {
  const claimed = new Set<ItemId>();

  const input = { ...deps, claimed };

  try {
    for (let claim = await claimNext(input); claim !== null; claim = await claimNext(input)) {
      const shape = getWorkerShape(deps.workers, claim.attempt.worker);

      // a job starts nothing: the first reading moves it to running
      if (shape.shape === 'session') {
        const worker = shape.worker;

        const fault =
          claim.kind === 'start'
            ? await startClaim({ ...deps, worker, claim })
            : await resumeClaim({ ...deps, worker, claim });

        logFault(deps, fault);
      }

      claimed.add(claim.attempt.item);
    }
  } catch (error) {
    deps.log.warn('the claim loop ended', { error: formatErrorChain(error) });
  }

  return claimed.size;
}

// The loader refuses a phase kind whose worker the server did not build, so every attempt it
// claims names a built one.
function getWorkerShape(workers: WorkerRegistry, name: WorkerKindName): WorkerShape {
  const shape = workers.get(name);

  invariant(shape !== undefined, `the server built the worker ${name}`);

  return shape;
}

function logFault(deps: TickDeps, fault: RunnerFault | null): void {
  if (fault === null) {
    return;
  }

  match(fault)
    .with({ fault: 'agent-session-owned' }, (owned) => {
      deps.log.warn('an agent session is bound to another attempt', {
        attempt: owned.attempt,
        holder: owned.holder,
      });
    })
    .with({ fault: 'spawn-refused' }, { fault: 'wake-refused' }, (refused) => {
      const call = refused.fault === 'spawn-refused' ? 'spawn' : 'wake';

      deps.log.warn(`the worker refused a ${call}`, {
        attempt: refused.attempt,
        item: refused.item,
        cause: refused.cause,
        reason: refused.reason,
      });
    })
    .exhaustive();
}

// One reading per live attempt. A reading that throws skips its attempt; the next tick reads it
// again.
async function runReadings(deps: TickDeps): Promise<number> {
  const live = await deps.store.read((tx) => tx.listLiveAttempts());

  const readings = new Map<AttemptId, SessionReading>();

  for (const attempt of live) {
    try {
      const shape = getWorkerShape(deps.workers, attempt.worker);

      const step = await readAttemptStep(deps, attempt);

      if (shape.shape === 'job') {
        const fault = await runJobReading({ ...deps, job: shape.worker, attempt, step });

        logJobFault(deps, fault);
        continue;
      }

      const reading = await shape.worker.reconcile(attempt);

      readings.set(attempt.id, reading);

      const action = pickReadingAction({
        attempt,
        reading,
        step,
        sleep: deps.rules.sleep,
        now: deps.now,
      });

      const faults = await actOnReading({
        ...deps,
        worker: shape.worker,
        attempt,
        reading,
        action,
      });

      for (const fault of faults) {
        logFault(deps, fault);
      }
    } catch (error) {
      deps.log.warn('the reading of an attempt failed', {
        attempt: attempt.id,
        error: formatErrorChain(error),
      });
    }
  }

  deps.readings.clear();

  for (const [attempt, reading] of readings) {
    deps.readings.set(attempt, reading);
  }

  return readings.size;
}

async function readAttemptStep(deps: TickDeps, attempt: AttemptRow): Promise<PipelineStep | null> {
  const item = await deps.store.read((tx) => tx.readItem(attempt.item, deps.now, deps.rules));

  const pipeline = item === null ? undefined : deps.rules.kinds.get(item.kind)?.pipeline;

  return pipeline?.steps.find((step) => step.phase === attempt.phase) ?? null;
}

function logJobFault(deps: TickDeps, fault: JobFault | null): void {
  if (fault === null) {
    return;
  }

  match(fault)
    .with({ fault: 'job-without-drive' }, (missing) => {
      deps.log.warn('a job phase gives no drive', {
        attempt: missing.attempt,
        phase: missing.phase,
      });
    })
    .with({ fault: 'job-timed-out' }, (timedOut) => {
      deps.log.warn('a job read failed past its time limit; the attempt timed out', {
        attempt: timedOut.attempt,
        error: formatErrorChain(timedOut.error),
      });
    })
    .with({ fault: 'job-close-out-refused' }, (refused) => {
      deps.log.warn('a job phase refused its own close-out', {
        attempt: refused.attempt,
        problems: refused.problems,
      });
    })
    .exhaustive();
}

const hourMs = 3_600_000;

// The stop of each session that the give-up rule left running, sent again on every tick for
// `timeouts.strayHours`.
async function runStrayStops(deps: TickDeps): Promise<number> {
  const since = brandSchemas.instant.parse(Math.max(0, deps.now - timeouts.strayHours * hourMs));
  let stopped = 0;

  try {
    const strays = await deps.store.read((tx) => tx.listStrayAttempts(since));

    for (const attempt of strays) {
      const result = await stopStraySession({
        ...deps,
        worker: getSessionWorker(deps.workers),
        attempt,
        actor: runnerActor(deps),
      });

      stopped += result === null ? 0 : 1;
    }
  } catch (error) {
    deps.log.warn('the stop of the stray sessions failed', { error: formatErrorChain(error) });
  }

  return stopped;
}

// Only a session leaves a stray or a session to forget, and the server builds one session worker.
function getSessionWorker(workers: WorkerRegistry): WorkerKind {
  const sessions = [...workers.values()].flatMap((shape) =>
    shape.shape === 'session' ? [shape.worker] : [],
  );

  const [worker] = sessions;

  invariant(worker !== undefined && sessions.length === 1, 'the server builds one session worker');

  return worker;
}

function runnerActor(deps: TickDeps) {
  return `boxxy:runner:${deps.runner}` as const;
}

async function runForget(deps: TickDeps): Promise<number> {
  try {
    const report = await forgetSessions({
      ...deps,
      worker: getSessionWorker(deps.workers),
      actor: runnerActor(deps),
    });

    if (report.failed.length > 0) {
      deps.log.warn('the worker did not confirm the forget of done sessions', {
        sessions: report.failed,
      });
    }

    return report.forgotten.length;
  } catch (error) {
    deps.log.warn('the forget of the done sessions failed', { error: formatErrorChain(error) });

    return 0;
  }
}

async function runNotices(deps: TickDeps): Promise<NoticeReport | null> {
  try {
    const report = await sendNotices(deps);

    if (report.lastError !== null) {
      deps.noticeStatus.lastError = report.lastError;
    }

    return report;
  } catch (error) {
    deps.log.warn('the send of the hold notices failed', { error: formatErrorChain(error) });

    return null;
  }
}
