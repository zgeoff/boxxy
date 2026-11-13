import type { GateReading, GateRound, JsonValue, ReviewGate } from '@boxxy/model';
import { check } from '@noslop/cli/check';
import { sendResult } from '@noslop/cli/post';
import { buildGateCost } from './build-gate-cost.ts';
import { buildGateReading } from './build-gate-reading.ts';
import { buildReviewCommand } from './build-review-command.ts';
import { findForgeRefusal } from './find-forge-refusal.ts';
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

      const cost = buildGateCost(parsed.review);

      const posted = await client
        .sendResult(parsed.review, { env: options.appEnv, verify: true })
        .then(() => ({ kind: 'posted' as const }))
        .catch((error: unknown) => {
          if (isRefusal(error)) {
            return { kind: 'refused' as const, reason: null };
          }

          return { kind: 'refused' as const, reason: requireForgeRefusal(error) };
        });

      if (posted.kind === 'refused') {
        return posted.reason === null
          ? { status: 'not-covered', head: parsed.head, cost }
          : { status: 'not-covered', head: parsed.head, cost, reason: posted.reason };
      }

      const [owner = '', repo = ''] = round.pullRequest.repo.split('/');

      const outcome = await client
        .check(
          { owner, repo, number: round.pullRequest.number },
          { env: options.appEnv, readOnly: true },
        )
        .then((answer) => ({ kind: 'read' as const, answer }))
        .catch((error: unknown) => ({
          kind: 'refused' as const,
          reason: requireForgeRefusal(error),
        }));

      if (outcome.kind === 'refused') {
        return { status: 'not-covered', head: parsed.head, cost, reason: outcome.reason };
      }

      return buildGateReading({ round, ...parsed, outcome: outcome.answer });
    },
  };
}

// noslop wraps every failure of its check in one error, a network failure included. Only a cause
// that says the result does not verify, such as an old head, is a refusal of the result itself.
function isRefusal(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.cause instanceof Error &&
    error.cause.message.startsWith('the result does not verify')
  );
}

// A forge that refused the App, such as a 404 for a repo the App is not installed on, gives the
// same answer to every send, so the gate records it. Any other failure throws, so the session
// sends again.
function requireForgeRefusal(error: unknown): string {
  const refusal = findForgeRefusal(error);

  if (refusal === null) {
    throw error;
  }

  return refusal;
}
