import { countUnrelatedLines } from '@boxxy/closeout';
import type {
  AttemptRow,
  CloseOutAnswer,
  Forge,
  GateReading,
  ReviewCloseOut,
  ReviewGate,
  ReviewInput,
} from '@boxxy/model';
import { reviewInputSchema, storedReviewCloseOutSchema, toJSONValue } from '@boxxy/model';
import invariant from 'tiny-invariant';
import { closeOutAttempt, pickCloseOutStart } from './close-out-attempt.ts';
import type { CloseOutInput } from './types.ts';

export interface CloseOutCallInput extends CloseOutInput {
  // the review gate and the forge it reads changes from; null when the server has no review gate,
  // so a review close-out goes to the phase kind's parse as it was sent, which rejects it
  readonly review: { readonly gate: ReviewGate; readonly forge: Forge } | null;
}

// A review's body is the tool's raw result, which the gate posts outside the store lock, as the
// post goes to the forge. The session and repeat checks run first, so a call from another
// session, or a repeat of a stored body, never reaches the gate.
export async function closeOutCall(input: CloseOutCallInput): Promise<CloseOutAnswer> {
  const latest = await input.store.read((tx) => tx.findAttemptBySession(input.call.session));

  const start = pickCloseOutStart(latest, input.call, input.body);

  if (start.kind === 'answer') {
    return start.answer;
  }

  if (start.attempt.phase !== 'review' || input.review === null) {
    return closeOutAttempt(input);
  }

  const round = reviewInputSchema.safeParse(start.attempt.input);

  invariant(
    round.success,
    `a review attempt holds the input of its phase kind: ${start.attempt.id}`,
  );

  if (round.data.pullRequest === null) {
    return {
      kind: 'rejected',
      problems: [{ kind: 'phase-rule', message: 'the review has no pull request to review' }],
    };
  }

  const attempts = await input.store.read((tx) => tx.listItemAttempts(start.attempt.item));

  const built = await runReviewCloseOut({
    ...input.review,
    attempt: start.attempt,
    round: { ...round.data, pullRequest: round.data.pullRequest },
    earlier: findEarlierReading(attempts, start.attempt),
    body: input.body,
  });

  return closeOutAttempt({ ...input, body: built, sent: input.body });
}

interface ReviewCloseOutDeps {
  readonly gate: ReviewGate;
  readonly forge: Forge;
  readonly attempt: AttemptRow;
  readonly round: ReviewInput & { readonly pullRequest: NonNullable<ReviewInput['pullRequest']> };
  readonly earlier: GateReading | null;
  readonly body: unknown;
}

// Each review after the first counts the changed lines since the earlier review's head, in the
// files that had no open finding at that review. A reading that covers no head has nothing to
// compare.
async function runReviewCloseOut(deps: ReviewCloseOutDeps): Promise<ReviewCloseOut> {
  const round = deps.round;

  const reading = await deps.gate.accept(
    {
      attempt: deps.attempt.id,
      pullRequest: round.pullRequest,
      round: round.round,
      cause: round.cause,
    },
    toJSONValue(deps.body),
  );

  const earlier = deps.earlier;

  if (
    round.cause === 'first' ||
    earlier === null ||
    earlier.status === 'not-covered' ||
    reading.status === 'not-covered'
  ) {
    return { round: round.round, cause: round.cause, reading, unrelatedLines: null };
  }

  const changed = await deps.forge.readChangedFiles(
    round.pullRequest.repo,
    earlier.head,
    reading.head,
  );

  return {
    round: round.round,
    cause: round.cause,
    reading,
    unrelatedLines: countUnrelatedLines(changed, earlier.findingPaths),
  };
}

// The reading of the item's latest settled review before this attempt, from its close-out.
function findEarlierReading(
  attempts: readonly AttemptRow[],
  current: AttemptRow,
): GateReading | null {
  const earlier = attempts
    .filter((row) => row.phase === 'review' && row.id !== current.id && row.endedAt !== null)
    .toSorted((first, second) => (first.endedAt ?? 0) - (second.endedAt ?? 0))
    .flatMap((row) => {
      const parsed = storedReviewCloseOutSchema.safeParse(row.closeOut);

      return parsed.success ? [parsed.data.reading] : [];
    });

  return earlier.at(-1) ?? null;
}
