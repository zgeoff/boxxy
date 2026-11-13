import type {
  AttemptRow,
  CheckState,
  GateRecord,
  JobWorker,
  MergeObservation,
  PullRequestReading,
  PullRequestRef,
} from '@boxxy/model';
import { mergeInputSchema, storedReviewCloseOutSchema, toMergeObservationJSON } from '@boxxy/model';
import invariant from 'tiny-invariant';
import type { MergeJobDeps } from './types.ts';

// The job worker of the merge phase. Each read observes the pull request and decides nothing. A
// forge call that throws makes the read throw, and the tick reads again later.
export function createMergeJob(deps: MergeJobDeps): JobWorker {
  return {
    read: async (attempt) => {
      const ref = getPullRequestRef(attempt);

      const reading = await deps.forge.readPullRequest(ref);

      if (reading === 'not-found') {
        throw new Error(`the forge holds no pull request ${ref.repo}#${ref.number}`);
      }

      const head = reading.commits.at(-1)?.sha;

      if (head === undefined) {
        throw new Error(`the pull request ${ref.repo}#${ref.number} has no commit`);
      }

      const attempts = await deps.store.read((tx) => tx.listItemAttempts(attempt.item));

      const observed: MergeObservation = {
        pullRequest: ref,
        state: reading.state,
        head,
        mergeCommit: reading.mergeCommit,
        review: findLatestReview(attempts),
        ...(await readOpenState(deps, ref, reading, head)),
      };

      return { kind: 'running', observed: toMergeObservationJSON(observed) };
    },
    act: (_attempt, action) => {
      const [member, ...others] = action.unit.members;

      invariant(
        member !== undefined && others.length === 0,
        'a direct merge takes one pull request',
      );

      return deps.forge.mergeAtHead(member.pullRequest, member.head, action.method);
    },
  };
}

// A merge with no pull request has nothing to read, and its read throws until the owner acts.
function getPullRequestRef(attempt: AttemptRow): PullRequestRef {
  const link = mergeInputSchema.parse(attempt.input).pullRequest;

  if (link === null) {
    throw new Error(`the merge attempt ${attempt.id} names no pull request`);
  }

  return { repo: link.repo, number: link.number };
}

// The latest review attempt with a close-out, of any outcome; a lost review has none.
function findLatestReview(attempts: readonly AttemptRow[]): GateRecord | null {
  const latest = attempts.findLast(
    (attempt) =>
      attempt.phase === 'review' && attempt.endedAt !== null && attempt.closeOut !== null,
  );

  if (latest === undefined) {
    return null;
  }

  const reading = storedReviewCloseOutSchema.parse(latest.closeOut).reading;

  return { head: reading.head, status: reading.status, attempt: latest.id };
}

type OpenState = Pick<MergeObservation, 'mergeable' | 'checks' | 'baseRequired' | 'verify'>;

// The merge rule reads these only for an open pull request, so a merged or closed one makes no
// more calls, and a base branch deleted after the merge throws nothing.
async function readOpenState(
  deps: MergeJobDeps,
  ref: PullRequestRef,
  reading: PullRequestReading,
  head: MergeObservation['head'],
): Promise<OpenState> {
  if (reading.state !== 'open') {
    return {
      mergeable: 'unknown',
      checks: new Map(),
      baseRequired: [],
      verify: { status: 'not-covered', head },
    };
  }

  const [mergeable, checks, baseRequired, verify] = await Promise.all([
    deps.forge.readMergeable(ref),
    deps.forge.readChecks(ref.repo, head),
    deps.forge.readRequiredChecks(ref.repo, reading.base),
    deps.verifier.readAt(ref, head),
  ]);

  const states = new Map<string, CheckState>(
    [...checks].map(([name, check]) => [name, check.state]),
  );

  return { mergeable, checks: states, baseRequired, verify };
}
