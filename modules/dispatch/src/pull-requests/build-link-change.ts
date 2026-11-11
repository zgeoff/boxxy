import type {
  ActorRef,
  AnyNewFact,
  AttemptRow,
  Instant,
  NewId,
  PullRequestReading,
  PullRequestRef,
  PullRequestRow,
  StoreChange,
} from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { buildStateFact } from './build-state-fact.ts';
import { collectSeenState } from './collect-seen-state.ts';

export interface LinkChangeInput {
  readonly attempt: AttemptRow;
  readonly ref: PullRequestRef;
  readonly reading: PullRequestReading;
  readonly source: 'hook' | 'watch';
  readonly actor: ActorRef;
  readonly now: Instant;
  readonly newId: NewId;
}

// The change that links a pull request to an attempt: the pull request row, the evidence row
// and `boxxy.pull_request.linked` in one change. A pull request the forge already shows merged
// or closed also gets its merge or close fact, because the watch reads only open rows.
export function buildLinkChange(input: LinkChangeInput): StoreChange {
  const attempt = input.attempt;
  const ref = input.ref;
  const reading = input.reading;
  const now = input.now;
  const seen = collectSeenState(reading);
  const linkedFactId = brandSchemas.factId.parse(input.newId());

  const row: PullRequestRow = {
    repo: ref.repo,
    number: ref.number,
    attempt: attempt.id,
    githubId: reading.githubId,
    url: reading.url,
    state: seen.state,
    mergedAt: seen.mergedAt,
    mergeCommit: seen.mergeCommit,
    checkedAt: now,
  };

  const entity = `boxxy:item:${attempt.item}` as const;

  const linked: AnyNewFact = {
    id: linkedFactId,
    type: 'boxxy.pull_request.linked',
    entity,
    actor: input.actor,
    payload: {
      attempt: attempt.id,
      repo: ref.repo,
      number: ref.number,
      url: reading.url,
      pullRequestId: String(reading.githubId),
      source: input.source,
    },
  };

  const stateFact = buildStateFact({
    row,
    item: attempt.item,
    actor: input.actor,
    id: brandSchemas.factId.parse(input.newId()),
  });

  const stateFacts = stateFact === null ? [] : [stateFact];

  return {
    at: now,
    writes: [
      { op: 'insert', table: 'pull_requests', row },
      {
        op: 'insert',
        table: 'evidence',
        row: {
          factId: linkedFactId,
          attempt: attempt.id,
          kind: 'pull_request',
          ref: reading.url,
          observed: null,
          source: input.source,
          at: now,
        },
      },
    ],
    facts: [linked, ...stateFacts],
  };
}
