import { findPullRequestLink } from '@boxxy/closeout';
import type { AttemptRow, CheckedEvidenceRefusal, CommitSha } from '@boxxy/model';
import { pickCheckRefusal } from './pick-check-refusal.ts';
import { pickVerdictRefusal } from './pick-verdict-refusal.ts';
import type { RecordEvidenceInput } from './types.ts';

export interface CheckedDraft {
  readonly kind: 'check' | 'verdict';
  readonly ref: string;
}

export type CheckedReading =
  | { readonly kind: 'passed'; readonly head: CommitSha }
  | { readonly kind: 'retry' }
  | { readonly kind: 'refused'; readonly refusal: CheckedEvidenceRefusal };

// Reads the item's latest pull request from the forge, and the check or the verify result at its
// head. A forge call that throws is a `retry`, and nothing has been written yet.
export async function readCheckedEvidence(
  input: RecordEvidenceInput,
  attempt: AttemptRow,
  draft: CheckedDraft,
): Promise<CheckedReading> {
  const forge = input.forge;
  const verifier = input.verifier;

  if (forge === null || verifier === null) {
    return { kind: 'refused', refusal: { reason: 'no-forge' } };
  }

  const detail = await input.store.read((tx) =>
    tx.readItemDetail(attempt.item, input.now, input.rules),
  );

  const link = findPullRequestLink(detail?.pullRequests ?? []);

  if (link === null) {
    return { kind: 'refused', refusal: { reason: 'no-pull-request' } };
  }

  const ref = { repo: link.repo, number: link.number };

  try {
    const reading = await forge.readPullRequest(ref);

    if (reading === 'not-found') {
      return { kind: 'retry' };
    }

    if (reading.state !== 'open') {
      return { kind: 'refused', refusal: { reason: 'pull-request-closed' } };
    }

    const head = reading.head;

    const checks = await forge.readChecks(link.repo, head);

    const verify = draft.kind === 'verdict' ? await verifier.readAt(ref, head) : null;

    const refusal =
      verify === null
        ? pickCheckRefusal(draft.ref, head, checks.get(draft.ref))
        : pickVerdictRefusal(draft.ref, head, checks.get(input.gateCheck), verify);

    return refusal === null ? { kind: 'passed', head } : { kind: 'refused', refusal };
  } catch {
    return { kind: 'retry' };
  }
}
