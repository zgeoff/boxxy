import { findWaitingSince, noticeLimits, timeouts } from '@boxxy/dispatch';
import type { AttemptRow, Instant, RowWrite, RunnerRow } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import type { ServerDeps } from '../types.ts';
import { api } from './api.ts';

const hourMs = 3_600_000;

// The runner's status, and its two switches. A switch writes the runner's row and no fact: the
// fact catalog has no runner fact.
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
      };
    });

    const outbox = await deps.outbox.status();

    return {
      paused: read.runner?.paused ?? false,
      limits: read.limits,
      attempts: read.attempts.map((entry) => ({
        ...entry,
        waitingSince: findAttemptWaitingSince(deps, entry.attempt),
      })),
      strays: read.strays,
      notices: { unsent: read.notices.length },
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
    await writePaused(options.context.deps, true);

    return { paused: true } as const;
  }),
  resume: api.runner.resume.handler(async (options) => {
    await writePaused(options.context.deps, false);

    return { paused: false } as const;
  }),
};

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

function writePaused(deps: ServerDeps, paused: boolean) {
  return deps.store.exclusive(async (tx) => {
    const now = deps.clock.now();

    const row = await tx.readRunner(deps.runner);

    const write = pickPausedWrite(row, deps, paused, now);

    if (write !== null) {
      await tx.applyChange({ at: now, writes: [write], facts: [] });
    }
  });
}

// the runner's row before its first heartbeat is inserted, so a pause holds from the start
function pickPausedWrite(
  row: RunnerRow | null,
  deps: ServerDeps,
  paused: boolean,
  now: Instant,
): RowWrite | null {
  if (row === null) {
    return { op: 'insert', table: 'runners', row: { id: deps.runner, heartbeatAt: now, paused } };
  }

  return row.paused === paused
    ? null
    : {
        op: 'update',
        table: 'runners',
        key: { id: deps.runner },
        expect: { paused: !paused },
        set: { paused },
      };
}
