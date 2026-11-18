import { shippedWaitName } from '@boxxy/model';
import type { WaitKind, WorkerKindName } from '@boxxy/model';

// The `shipped` wait holds once a shipped row names the item's merge commit, whatever the repo's
// ship rule says now. A repo that ships nothing skips the step. `worker` is the one that exists
// only with a `github` section.
export function createShippedWaitKind(worker: WorkerKindName): WaitKind {
  return {
    name: shippedWaitName,
    after: { outcome: 'merged' },
    worker,
    read: (subject, repo) => {
      const commit = subject.mergeCommit;

      if (commit !== null && subject.shipped.some((row) => row.commit === commit)) {
        return 'holds';
      }

      return repo.ships === 'none' ? 'skip' : 'waiting';
    },
  };
}
