import type { KeptSession, SpawnRequest, StartOutcome, WorkerKind } from '@boxxy/model';

export interface ResumedSession {
  readonly outcome: StartOutcome;

  // true when the wake failed and the outcome is that of a fresh spawn
  readonly resumeFallback: boolean;
}

// Wakes the kept session with the new attempt's prompt as a message. A session that is gone or
// refuses the wake is replaced by a fresh spawn. A refusal for capacity or an unanswered wake is
// not: a spawn would meet the same capacity, and the session may be running.
export async function resumeKeptSession(
  worker: WorkerKind,
  kept: KeptSession,
  spawn: SpawnRequest,
): Promise<ResumedSession> {
  const outcome = await worker.resumeKept(kept, spawn);

  if (outcome.kind === 'refused' && outcome.cause === 'other') {
    return { outcome: await worker.start(spawn), resumeFallback: true };
  }

  return { outcome, resumeFallback: false };
}
