import type { CommitSha, PullRequestRef, Verifier, VerifyReading } from '@boxxy/model';

export interface FakeVerifier extends Verifier {
  // the reading at every head from now on; `verified` with no features until a test sets one
  readonly setStatus: (status: VerifyReading['status']) => void;
  readonly reads: readonly { readonly pullRequest: PullRequestRef; readonly head: CommitSha }[];
}

// A verifier that reads the status the test set, at whatever head it is asked about.
export function createFakeVerifier(): FakeVerifier {
  const reads: { pullRequest: PullRequestRef; head: CommitSha }[] = [];
  let status: VerifyReading['status'] = 'verified';

  return {
    readAt: (pullRequest, head) => {
      reads.push({ pullRequest, head });

      const reading: VerifyReading =
        status === 'not-covered' ? { status, head } : { status, head, features: [] };

      return Promise.resolve(reading);
    },
    setStatus: (next) => {
      status = next;
    },
    reads,
  };
}
