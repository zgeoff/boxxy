import type { GateReading, GateRound, JsonValue, ReviewGate } from '@boxxy/model';
import { check } from '@noslop/cli/check';
import { sendResult } from '@noslop/cli/post';
import { buildGateCost } from './build-gate-cost.ts';
import { buildGateReading } from './build-gate-reading.ts';
import { buildReviewCommand } from './build-review-command.ts';
import { parseReviewBody } from './parse-review-body.ts';
import type { NoslopReviewGateOptions } from './types.ts';

// The server's side of a review: it checks and posts the result a review session sent, with the
// noslop App's keys, which no agent host gets.
export function createNoslopReviewGate(options: NoslopReviewGateOptions): ReviewGate {
  const client = options.client ?? { sendResult, check };

  return {
    buildCommand: buildReviewCommand,
    accept: async (round: GateRound, result: JsonValue): Promise<GateReading> => {
      const parsed = parseReviewBody(round, result);

      if (parsed.kind === 'not-covered') {
        return { status: 'not-covered', head: parsed.head, cost: parsed.cost };
      }

      const posted = await client
        .sendResult(parsed.review, { env: options.appEnv, verify: true })
        .then(() => 'posted' as const)
        .catch((error: unknown) => {
          if (isRefusal(error)) {
            return 'refused' as const;
          }

          throw error;
        });

      if (posted === 'refused') {
        return { status: 'not-covered', head: parsed.head, cost: buildGateCost(parsed.review) };
      }

      const [owner = '', repo = ''] = round.pullRequest.repo.split('/');

      const outcome = await client.check(
        { owner, repo, number: round.pullRequest.number },
        { env: options.appEnv, readOnly: true },
      );

      return buildGateReading({ round, ...parsed, outcome });
    },
  };
}

// noslop wraps every failure of its check in one error, a network failure included. Only a cause
// that says the result does not verify, such as an old head, is a refusal; any other failure
// throws, so the session sends again.
function isRefusal(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.cause instanceof Error &&
    error.cause.message.startsWith('the result does not verify')
  );
}
