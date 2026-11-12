import type { GateRound, JsonValue, ReviewGate } from '@boxxy/model';
import { brandSchemas, gateReadingSchema } from '@boxxy/model';

export interface PostHold {
  // resolves once a post has been recorded and `accept` waits
  readonly entered: Promise<void>;
  readonly release: () => void;
}

export interface FakeReviewGate extends ReviewGate {
  // each result that `accept` posted, in order
  readonly posted: readonly { readonly round: GateRound; readonly result: JsonValue }[];

  // the next `accept` records its post, then waits until the test calls `release`, as a server
  // that stops after the post and before the store
  holdAfterNextPost: () => PostHold;
}

const zeroHead = brandSchemas.commitSha.parse('0'.repeat(40));

// A review gate whose session sends the reading itself as the tool's result. `accept` posts the
// result and answers with that reading; a result that is no reading covers no head.
export function createFakeReviewGate(): FakeReviewGate {
  const posted: { round: GateRound; result: JsonValue }[] = [];
  let hold: { readonly entered: () => void; readonly released: Promise<void> } | null = null;

  return {
    posted,
    holdAfterNextPost: () => {
      const entered = Promise.withResolvers<undefined>();
      const released = Promise.withResolvers<undefined>();

      hold = {
        entered: () => {
          entered.resolve(undefined);
        },
        released: released.promise,
      };

      return {
        entered: entered.promise,
        release: () => {
          released.resolve(undefined);
        },
      };
    },
    buildCommand: (round) =>
      `review-tool --pr ${round.pullRequest.number} --repo ${round.pullRequest.repo} --cause ${round.cause}`,
    accept: async (round, result) => {
      posted.push({ round, result });

      const held = hold;

      hold = null;

      if (held !== null) {
        held.entered();

        await held.released;
      }

      const reading = gateReadingSchema.safeParse(result);

      return reading.success
        ? reading.data
        : { status: 'not-covered', head: zeroHead, cost: { calls: [] } };
    },
  };
}
