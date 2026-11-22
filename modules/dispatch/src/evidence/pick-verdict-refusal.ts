import type { CheckReading, CheckedEvidenceRefusal, CommitSha, VerifyReading } from '@boxxy/model';

// Null when the verify gate passed at `head` and its report lists the feature as verified. `gate`
// is the gate's check at `head`; the verifier reads a pending, absent or cancelled gate as one
// reading, so the gate's own state tells those apart.
export function pickVerdictRefusal(
  feature: string,
  head: CommitSha,
  gate: CheckReading | undefined,
  verify: VerifyReading,
): CheckedEvidenceRefusal | null {
  if (gate?.source !== 'check-run' || gate.state === 'pending') {
    return { reason: 'verify-pending', feature, head };
  }

  if (gate.state === 'other') {
    return { reason: 'verify-failed', feature, head };
  }

  if (verify.status === 'not-covered') {
    return { reason: 'verify-pending', feature, head };
  }

  if (verify.status === 'incomplete') {
    return {
      reason: 'verify-failed',
      feature,
      head,
      ...(verify.note === undefined ? {} : { note: verify.note }),
    };
  }

  const isListed = verify.features.some(
    (listed) => listed.name === feature && listed.status === 'verified',
  );

  return isListed ? null : { reason: 'verdict-missing', feature, head };
}
