import { findWaitingSince, noticeLimits, timeouts } from '@boxxy/dispatch';
import type { AnyNewFact, AttemptRow, Instant, RowWrite, RunnerRow } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import type { ServerDeps } from '../types.ts';
import { api } from './api.ts';
import { buildRunnerFact } from './build-runner-fact.ts';

const hourMs = 3_600_000;
const owner = 'boxxy:owner:local';

// The runner's status, and its two switches. A switch writes the runner's row and one fact in one
// change.
export const runnerHandlers = {
  status: api.runner.status.handler(async (options) => {
    const deps = options.context.deps;
    const state = deps.rulesState();
    const now = deps.clock.now();
    const since = now - timeouts.strayHours * hourMs;

    const read = await deps.store.read(async (tx) => {
      const live = await tx.listLiveAttempts();

      return {
        runner: await tx.readRunner(deps.runner),
        limits: await tx.listLimits(),
        attempts: await Promise.all(
          live.map(async (attempt) => {
            const item = await tx.readItem(attempt.item, now, state.rules);

            return { attempt, title: item?.title ?? '' };
          }),
        ),
        strays: await tx.listStrayAttempts(brandSchemas.instant.parse(Math.max(0, since))),
        notices: await tx.listUnsentNotices(noticeLimits.readRows),
        capacity: await tx.readCapacityRefusals(),
      };
    });

    const outbox = await deps.outbox.status();

    return {
      paused: read.runner?.paused ?? false,
      pause:
        read.runner?.paused === true
          ? {
              since: toISOOrNull(read.runner.pausedAt),
              by: read.runner.pausedBy,
              reason: read.runner.pauseReason,
            }
          : null,
      limits: read.limits,
      attempts: read.attempts.map((entry) => ({
        ...entry,
        waitingSince: findAttemptWaitingSince(deps, entry.attempt),
      })),
      strays: read.strays,
      capacityRefusals: {
        latest:
          read.capacity.latest === null
            ? null
            : {
                at: new Date(read.capacity.latest.at).toISOString(),
                code: read.capacity.latest.refusal?.code ?? null,
                problem: read.capacity.latest.refusal?.problem ?? null,
                message: read.capacity.latest.refusal?.message ?? null,
              },
        sinceLastSpawn: read.capacity.count,
      },
      notices: {
        unsent: read.notices.length,
        oldestUnsentAt:
          read.notices.length === 0
            ? null
            : new Date(Math.min(...read.notices.map((notice) => notice.at))).toISOString(),
        lastError: read.notices.length === 0 ? null : deps.noticeStatus.lastError,
      },
      outbox,
      rules: {
        version: state.rules.version,
        commit: state.rules.commit,
        lastRejected:
          state.lastRejected === null
            ? null
            : { ...state.lastRejected, rejections: [...state.lastRejected.rejections] },
      },
    };
  }),
  pause: api.runner.pause.handler(async (options) => {
    const deps = options.context.deps;
    const reason = options.input.reason ?? null;

    const changed = await writePaused(deps, true, reason);

    if (changed) {
      deps.log.warn('the runner was paused', { by: owner, reason });
    }

    return { paused: true } as const;
  }),
  resume: api.runner.resume.handler(async (options) => {
    const deps = options.context.deps;

    const changed = await writePaused(deps, false, null);

    if (changed) {
      deps.log.warn('the runner was resumed', { by: owner });
    }

    return { paused: false } as const;
  }),
};

function toISOOrNull(at: Instant | null): string | null {
  return at === null ? null : new Date(at).toISOString();
}

function findAttemptWaitingSince(deps: ServerDeps, attempt: AttemptRow) {
  const reading = deps.readings.get(attempt.id);

  return reading === undefined
    ? null
    : findWaitingSince({
        attempt,
        reading,
        quietAfterMinutes: deps.rulesState().rules.sleep.afterQuietMinutes,
        now: deps.clock.now(),
      });
}

// The runner's row, its fact and one log line change together. Only the owner reaches the two
// switches, so the actor is always the owner. A switch to the state the runner is in writes no
// fact and logs nothing.
function writePaused(deps: ServerDeps, paused: boolean, reason: string | null) {
  return deps.store.exclusive(async (tx) => {
    const now = deps.clock.now();

    const row = await tx.readRunner(deps.runner);

    const change = pickPausedChange(row, deps, { paused, reason, now });

    if (change !== null) {
      await tx.applyChange({ at: now, writes: [change.write], facts: [change.fact] });
    }

    return change !== null;
  });
}

interface PausedChange {
  readonly write: RowWrite;
  readonly fact: AnyNewFact;
}

interface PausedRequest {
  readonly paused: boolean;
  readonly reason: string | null;
  readonly now: Instant;
}

// The runner's row is missing before its first heartbeat, so a pause holds from the start. A
// resume of a runner with no row finds nothing paused.
function pickPausedChange(
  row: RunnerRow | null,
  deps: ServerDeps,
  request: PausedRequest,
): PausedChange | null {
  if (row?.paused === request.paused || (row === null && !request.paused)) {
    return null;
  }

  const fact = request.paused
    ? buildRunnerFact(deps, 'boxxy.runner.paused', {
        runner: deps.runner,
        reason: request.reason,
      })
    : buildRunnerFact(deps, 'boxxy.runner.resumed', { runner: deps.runner });

  const state: Omit<RunnerRow, 'id' | 'heartbeatAt'> = request.paused
    ? {
        paused: true,
        pausedAt: request.now,
        pausedBy: owner,
        pauseReason: request.reason,
        pauseNoticedAt: null,
      }
    : { paused: false, pausedAt: null, pausedBy: null, pauseReason: null, pauseNoticedAt: null };

  const write: RowWrite =
    row === null
      ? {
          op: 'insert',
          table: 'runners',
          row: { id: deps.runner, heartbeatAt: request.now, ...state },
        }
      : {
          op: 'update',
          table: 'runners',
          key: { id: deps.runner },
          expect: { paused: !request.paused },
          set: state,
        };

  return { write, fact };
}
