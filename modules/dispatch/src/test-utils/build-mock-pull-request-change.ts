import { brandSchemas } from '@boxxy/model';
import type { AttemptRow, PullRequestRow, StoreChange } from '@boxxy/model';
import { buildMockFactId } from '@boxxy/model/test-utils/build-mock-fact-id';
import { buildMockV1PullRequestRow } from '@boxxy/model/test-utils/build-mock-v1-pull-request-row';

interface PullRequestInput {
  readonly attempt: AttemptRow;
  readonly state: PullRequestRow['state'];
  readonly number?: number;
}

// The hook links a pull request of `acme/lamps` to the attempt, with its evidence row.
export function buildMockPullRequestChange(input: PullRequestInput): StoreChange {
  const attempt = input.attempt;
  const linkedAt = brandSchemas.instant.parse(4000);
  const factId = buildMockFactId();
  const number = input.number ?? 7;

  const pullRequest = buildMockV1PullRequestRow({
    repo: brandSchemas.repoName.parse('acme/lamps'),
    number,
    attempt: attempt.id,
    githubId: 2_000_000 + number,
    state: input.state,
    checkedAt: linkedAt,
  });

  return {
    at: linkedAt,
    writes: [
      { op: 'insert', table: 'pull_requests', row: pullRequest },
      {
        op: 'insert',
        table: 'evidence',
        row: {
          factId,
          attempt: attempt.id,
          kind: 'pull_request',
          ref: pullRequest.url,
          observed: null,
          source: 'hook',
          at: linkedAt,
        },
      },
    ],
    facts: [
      {
        id: factId,
        type: 'boxxy.pull_request.linked',
        entity: `boxxy:item:${attempt.item}`,
        actor: `boxxy:hook:${attempt.id}`,
        payload: {
          attempt: attempt.id,
          repo: pullRequest.repo,
          number,
          url: pullRequest.url,
          pullRequestId: String(pullRequest.githubId),
          source: 'hook',
        },
      },
    ],
  };
}
