import type { CheckReading, CheckedEvidenceRefusal, CommitSha } from '@boxxy/model';
import { match } from 'ts-pattern';

// Null when the check passed at `head`. Only a check run counts: any token that can post a commit
// status can post one of any name, so a status alone reads as no check.
export function pickCheckRefusal(
  check: string,
  head: CommitSha,
  reading: CheckReading | undefined,
): CheckedEvidenceRefusal | null {
  if (reading?.source !== 'check-run') {
    return { reason: 'check-missing', check, head };
  }

  return match(reading.state)
    .with('success', () => null)
    .with('pending', () => ({ reason: 'check-pending' as const, check, head }))
    .with('failure', 'other', () => ({ reason: 'check-failed' as const, check, head }))
    .exhaustive();
}
