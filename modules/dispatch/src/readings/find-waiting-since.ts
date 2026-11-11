import type { AttemptRow, Instant, SessionReading } from '@boxxy/model';

const minuteMs = 60_000;

interface WaitingInput {
  readonly attempt: AttemptRow;
  readonly reading: SessionReading;

  // the rules' `sleep.afterQuietMinutes`
  readonly quietAfterMinutes: number;
  readonly now: Instant;
}

// Since when the session has waited for the owner, from the reading alone, or null. Pure.
export function findWaitingSince(input: WaitingInput): Instant | null {
  const reading = input.reading;

  if (reading.kind !== 'running') {
    return null;
  }

  if (reading.attention === 'needs-input') {
    return reading.lastActivityAt;
  }

  if (reading.attention === 'turn-ended' && input.attempt.mode === 'attended') {
    return reading.lastActivityAt;
  }

  // atc lists a revived session as running, so a woken session that did nothing since waits
  const wokenAt = input.attempt.wokenAt;

  if (wokenAt !== null && reading.lastActivityAt <= wokenAt) {
    return wokenAt;
  }

  // the quiet rule: an attach moves atc's state to running, so a prompt the owner read and left
  // reads as working with no later activity
  const quietMs = input.now - reading.lastActivityAt;

  if (input.attempt.mode === 'attended' && quietMs >= input.quietAfterMinutes * minuteMs) {
    return reading.lastActivityAt;
  }

  return null;
}
