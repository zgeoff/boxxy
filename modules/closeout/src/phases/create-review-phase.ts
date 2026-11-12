import type {
  GateReading,
  PhaseInputContext,
  ReviewCloseOut,
  ReviewGate,
  ReviewInput,
} from '@boxxy/model';
import {
  brandSchemas,
  collectSettled,
  definePhase,
  reviewCloseOutSchema,
  toJSONValue,
} from '@boxxy/model';
import { match } from 'ts-pattern';
import { buildSchemaParser } from '../build-schema-parser.ts';
import { buildRoundCause } from '../review/build-round-cause.ts';
import { findPullRequestLink } from '../utils/find-pull-request-link.ts';

// The server passes the gate's pure `buildCommand`, so the module never imports an adapter. The
// session runs the command and sends the tool's raw result; the server builds the stored
// close-out from it, and this parser reads that.
export function createReviewPhase(deps: Pick<ReviewGate, 'buildCommand'>) {
  return definePhase({
    name: brandSchemas.phaseName.parse('review'),
    version: 2,
    worker: brandSchemas.workerKindName.parse('atc.session'),
    outcomes: ['passed', 'changes-requested', 'failed'],
    needsAcceptance: true,
    input: (ctx) => toJSONValue(buildReviewInput(ctx, deps)),
    closeOut: buildSchemaParser({
      schema: reviewCloseOutSchema,
      toBody: (raw): ReviewCloseOut => raw,
      check: () => [],
    }),
    settle: (input) => {
      const outcome = pickReviewOutcome(input.closeOut.reading);

      return {
        state: outcome === 'failed' ? 'failed' : 'succeeded',
        failure: outcome === 'failed' ? 'review-failed' : null,
        outcome,
        effects: [],
        frictionDropped: 0,
      };
    },
  });
}

// The round counts the reviews since the item's latest retry that asked for changes.
function buildReviewInput(
  ctx: PhaseInputContext,
  deps: Pick<ReviewGate, 'buildCommand'>,
): ReviewInput {
  const since = ctx.retries.at(-1)?.at ?? Number.NEGATIVE_INFINITY;
  const settled = collectSettled(ctx.history).filter((attempt) => attempt.endedAt > since);

  const round =
    1 +
    settled.filter(
      (attempt) => attempt.phase === 'review' && attempt.outcome === 'changes-requested',
    ).length;

  const cause = buildRoundCause(settled);
  const link = findPullRequestLink(ctx.pullRequests);

  if (link === null) {
    return { pullRequest: null, round, cause, command: null };
  }

  const pullRequest = { repo: link.repo, number: link.number };

  return {
    pullRequest,
    round,
    cause,
    command: deps.buildCommand({ attempt: ctx.attempt, pullRequest, round, cause }),
  };
}

// A failed call, an unreadable result or a reading that covers no head is `failed`: boxxy cannot
// tell whether the head is clear.
function pickReviewOutcome(reading: GateReading): 'passed' | 'changes-requested' | 'failed' {
  return match(reading)
    .with({ status: 'passed' }, () => 'passed' as const)
    .with({ status: 'blocked', why: 'open-findings' }, () => 'changes-requested' as const)
    .with({ status: 'blocked' }, { status: 'not-covered' }, () => 'failed' as const)
    .exhaustive();
}
