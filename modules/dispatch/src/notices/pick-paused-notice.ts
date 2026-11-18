import type { ActorRef, Instant, RunnerRow } from '@boxxy/model';
import { timeouts } from '../timeouts.ts';

const hourMs = 3_600_000;

export interface PausedNoticeDraft {
  readonly pausedAt: Instant;
  readonly pausedBy: ActorRef;
  readonly reason: string | null;
  readonly waiting: number;
}

// The notice a paused runner owes the owner, or null. One pause owes at most one: the runner row
// keeps the time the notice was queued, and a new pause clears it. A pause with no recorded time
// owes none, because its length is unknown.
export function pickPausedNotice(
  runner: RunnerRow | null,
  waiting: number,
  now: Instant,
): PausedNoticeDraft | null {
  if (
    runner === null ||
    !runner.paused ||
    runner.pausedAt === null ||
    runner.pausedBy === null ||
    runner.pauseNoticedAt !== null ||
    waiting === 0 ||
    now - runner.pausedAt < timeouts.pausedNoticeHours * hourMs
  ) {
    return null;
  }

  return {
    pausedAt: runner.pausedAt,
    pausedBy: runner.pausedBy,
    reason: runner.pauseReason,
    waiting,
  };
}
