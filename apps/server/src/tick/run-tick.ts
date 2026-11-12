import {
  actOnReading,
  claimNext,
  forgetSessions,
  pickReadingAction,
  resumeClaim,
  sendNotices,
  startClaim,
  stopStraySession,
  timeouts,
} from '@boxxy/dispatch';
import type { NoticeReport, SpawnSettings } from '@boxxy/dispatch';
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
} from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { match } from 'ts-pattern';
import { formatErrorChain } from '../format-error-chain.ts';
import type { ServerLog } from '../types.ts';

export interface TickDeps {
  readonly store: ClaimStore;
  readonly runner: RunnerId;
  readonly worker: WorkerKind;
  readonly rules: LoadedRules;
  readonly backoff: CapacityBackoff;
  readonly spawn: SpawnSettings;
  readonly notifier: Notifier;

  // one value for the whole tick
  readonly now: Instant;
  readonly newId: NewId;

  // the last reading of each live attempt; the tick replaces it whole
  readonly readings: Map<AttemptId, SessionReading>;
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

// The claim loop ends on three rules: `claimNext` gives no pick in a pool in backoff, no item is
// claimed twice in one tick, and an error ends the loop and not the tick.
async function runClaimLoop(deps: TickDeps): Promise<number> {
  const claimed = new Set<ItemId>();

  try {
    for (let claim = await claimNext(deps); claim !== null; claim = await claimNext(deps)) {
      const fault =
        claim.kind === 'start'
          ? await startClaim({ ...deps, claim })
          : await resumeClaim({ ...deps, claim });

      logFault(deps, fault);

      if (claimed.has(claim.attempt.item)) {
        deps.log.warn('the claim loop ended: an item was claimed twice in one tick', {
          item: claim.attempt.item,
        });

        break;
      }

      claimed.add(claim.attempt.item);
    }
  } catch (error) {
    deps.log.warn('the claim loop ended', { error: formatErrorChain(error) });
  }

  return claimed.size;
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
      const reading = await deps.worker.reconcile(attempt);
      const step = await readAttemptStep(deps, attempt);

      readings.set(attempt.id, reading);

      const action = pickReadingAction({
        attempt,
        reading,
        step,
        sleep: deps.rules.sleep,
        now: deps.now,
      });

      const faults = await actOnReading({ ...deps, attempt, reading, action });

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

const hourMs = 3_600_000;

// The stop of each session that the give-up rule left running, sent again on every tick for
// `timeouts.strayHours`.
async function runStrayStops(deps: TickDeps): Promise<number> {
  const since = brandSchemas.instant.parse(Math.max(0, deps.now - timeouts.strayHours * hourMs));
  let stopped = 0;

  try {
    const strays = await deps.store.read((tx) => tx.listStrayAttempts(since));

    for (const attempt of strays) {
      const result = await stopStraySession({ ...deps, attempt, actor: runnerActor(deps) });

      stopped += result === null ? 0 : 1;
    }
  } catch (error) {
    deps.log.warn('the stop of the stray sessions failed', { error: formatErrorChain(error) });
  }

  return stopped;
}

function runnerActor(deps: TickDeps) {
  return `boxxy:runner:${deps.runner}` as const;
}

async function runForget(deps: TickDeps): Promise<number> {
  try {
    const report = await forgetSessions({ ...deps, actor: runnerActor(deps) });

    return report.forgotten.length;
  } catch (error) {
    deps.log.warn('the forget of the done sessions failed', { error: formatErrorChain(error) });

    return 0;
  }
}

async function runNotices(deps: TickDeps): Promise<NoticeReport | null> {
  try {
    return await sendNotices(deps);
  } catch (error) {
    deps.log.warn('the send of the hold notices failed', { error: formatErrorChain(error) });

    return null;
  }
}
