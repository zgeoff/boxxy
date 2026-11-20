import type {
  AttemptRow,
  ChangedPaths,
  CheckState,
  CommitSha,
  GateRecord,
  JobReading,
  JobWorker,
  MergeObservation,
  PullRequestReading,
  PullRequestRef,
  UnreadableMerge,
} from '@boxxy/model';
import {
  mergeInputSchema,
  storedReviewCloseOutSchema,
  toJSONValue,
  toMergeObservationJSON,
} from '@boxxy/model';
import invariant from 'tiny-invariant';
import { isSignoffCovered } from './is-signoff-covered.ts';
import { pickSignoffVerdict } from './pick-signoff-verdict.ts';
import type { MergeJobDeps } from './types.ts';

// the reads of one merge read, counting the first, before a head that keeps moving makes it give up
const maxHeadReads = 3;

// The job worker of the merge phase. Each read observes the pull request and decides nothing. A
// forge call that throws makes the read throw, and the tick reads again later. A read that no
// later read can change, such as no pull request, gives an unreadable reading in place of a throw.
export function createMergeJob(deps: MergeJobDeps): JobWorker {
  return {
    read: async (attempt, ctx) => {
      const link = mergeInputSchema.parse(attempt.input).pullRequest;

      if (link === null) {
        return buildUnreadable({ state: 'unreadable', problem: 'no-pull-request' });
      }

      const ref: PullRequestRef = { repo: link.repo, number: link.number };

      const detail = await deps.store.read((tx) =>
        tx.readItemDetail(attempt.item, ctx.now, ctx.rules),
      );

      invariant(detail !== null, `a live attempt belongs to a stored item: ${attempt.item}`);

      const isCovered = isSignoffCovered(ctx.rules.merge, ref.repo);

      let reading = await deps.forge.readPullRequest(ref);

      // A push during the read of the paths makes the paths and the head disagree, so the read
      // starts over at the new head.
      for (let tries = 0; tries < maxHeadReads; tries += 1) {
        if (reading === 'not-found') {
          return buildUnreadable({
            state: 'unreadable',
            problem: 'pull-request-not-found',
            pullRequest: ref,
          });
        }

        const head = reading.commits.at(-1)?.sha;

        if (head === undefined) {
          return buildUnreadable({ state: 'unreadable', problem: 'no-commit', pullRequest: ref });
        }

        const openState = await readOpenState(deps, ref, reading, head);

        const changedPaths: ChangedPaths =
          isCovered && reading.state === 'open'
            ? await readChangedPaths(deps, ref, head)
            : { kind: 'not-read' };

        const observed: MergeObservation = {
          pullRequest: ref,
          state: reading.state,
          head,
          mergeCommit: reading.mergeCommit,
          review: findLatestReview(detail.attempts),
          changedPaths,
          signoff: pickSignoffVerdict(detail.item.levers, detail.attempts),
          ...openState,
        };

        if (changedPaths.kind === 'not-read') {
          return { kind: 'running', observed: toMergeObservationJSON(observed) };
        }

        const after = await deps.forge.readPullRequest(ref);

        if (after !== 'not-found' && after.commits.at(-1)?.sha === head) {
          return { kind: 'running', observed: toMergeObservationJSON(observed) };
        }

        reading = after;
      }

      throw new Error(`the head of ${ref.repo}#${ref.number} kept moving during the read`);
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

function buildUnreadable(unreadable: UnreadableMerge): JobReading {
  return { kind: 'running', observed: toJSONValue(unreadable) };
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

// The forge's list of the changed paths. It throws when the forge cannot list them, so the read
// throws and the next tick reads again: the job never merges a change whose paths it didn't read.
async function readChangedPaths(
  deps: MergeJobDeps,
  ref: PullRequestRef,
  head: CommitSha,
): Promise<ChangedPaths> {
  const listed = await deps.forge.readChangedPaths(ref);

  return { kind: listed.truncated ? 'truncated' : 'read', head, paths: listed.paths };
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
