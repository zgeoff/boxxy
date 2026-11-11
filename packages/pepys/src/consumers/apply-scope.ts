import {
  initBoxxyWorkModel,
  linkAttemptOf,
  linkProduced,
  linkRanIn,
  parseBoxxyItemID,
  readScopeFacts,
  toBoxxyAttemptID,
  toGithubPullRequestID,
  toTelemetrySessionID,
  updateBoxxyWorkModel,
} from '../generated/boxxy-work-boundary.ts';
import type {
  BoxxyItemID,
  BoxxyWorkMessage,
  BoxxyWorkModel,
  BoxxyWorkOperation,
} from '../generated/boxxy-work-boundary.ts';
import { foldWorkFacts } from '../work/fold-work-facts.ts';
import type { AttemptFold, WorkFold } from '../work/types.ts';

export type { BoxxyWorkMessage, BoxxyWorkModel } from '../generated/boxxy-work-boundary.ts';

// scriptc takes the model and message types through a re-export, but not the two functions
export function init(): BoxxyWorkModel {
  return initBoxxyWorkModel();
}

export function update(model: BoxxyWorkModel, message: BoxxyWorkMessage): BoxxyWorkModel {
  return updateBoxxyWorkModel(model, message);
}

// Every row and link of one item, from every fact of the item.
export function applyScope(scope: string): string {
  const item = parseBoxxyItemID(scope);

  if (item === undefined) {
    return JSON.stringify([]);
  }

  const fold = foldWorkFacts(readScopeFacts(item));

  return JSON.stringify(buildItemOperations(item, fold));
}

function buildItemOperations(item: BoxxyItemID, fold: WorkFold): BoxxyWorkOperation[] {
  const operations: BoxxyWorkOperation[] = [];

  if (fold.item !== null) {
    operations.push({ upsert: { boxxy_item: { ...fold.item, id: item } } });
  }

  for (const attempt of fold.attempts) {
    operations.push(...buildAttemptOperations(item, attempt));
  }

  return operations;
}

function buildAttemptOperations(item: BoxxyItemID, attempt: AttemptFold): BoxxyWorkOperation[] {
  const id = toBoxxyAttemptID(attempt.id);

  const operations: BoxxyWorkOperation[] = [
    {
      upsert: {
        boxxy_attempt: {
          id,
          item_id: item,
          phase: attempt.phase,
          number: attempt.number,
          round: attempt.round,
          mode: attempt.mode,
          pool: attempt.pool,
          recipe_hash: attempt.recipe_hash,
          rules_version: attempt.rules_version,
          atc_session: attempt.atc_session,
          state: attempt.state,
          outcome: attempt.outcome,
          failure: attempt.failure,
          claimed_at: attempt.claimed_at,
          started_at: attempt.started_at,
          closed_out_at: attempt.closed_out_at,
          ended_at: attempt.ended_at,
          sleeps: attempt.sleeps,
          updated_at: attempt.updated_at,
        },
      },
    },
    linkAttemptOf({ from: id, to: item, confidence: 1, evidence: attempt.claimedFact }),
  ];

  for (const bound of attempt.sessions) {
    const session = toTelemetrySessionID(bound.session);

    operations.push(
      {
        upsert: {
          boxxy_attempt_session: {
            attempt_id: id,
            session_id: session,
            key: bound.key,
            product: bound.product,
            caller_issuer: bound.caller_issuer,
            caller_subject: bound.caller_subject,
            bound_at: bound.bound_at,
          },
        },
      },
      linkRanIn({ from: id, to: session, confidence: 1, evidence: bound.evidence }),
    );
  }

  for (const pullRequest of attempt.pullRequests) {
    operations.push(
      linkProduced({
        from: id,
        to: toGithubPullRequestID(pullRequest.id),
        confidence: 1,
        evidence: pullRequest.evidence,
      }),
    );
  }

  return operations;
}
