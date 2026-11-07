import { brandSchemas } from '@boxxy/model';
import type { AttemptRow, PullRequestRow, StoreChange } from '@boxxy/model';
import { buildMockFactId } from '@boxxy/model/test-utils/build-mock-fact-id';
import { buildMockPullRequestRow } from '@boxxy/model/test-utils/build-mock-pull-request-row';

interface PullRequestInput {
  readonly attempt: AttemptRow;
  readonly state: PullRequestRow['state'];
}

// PR 7 of acme/lamps, linked by the hook, with its evidence row
export function buildMockPullRequestChange(input: PullRequestInput): StoreChange {
  const attempt = input.attempt;
  const linkedAt = brandSchemas.instant.parse(4000);
  const factId = buildMockFactId();
  const url = 'https://github.com/acme/lamps/pull/7';

  const pullRequest = buildMockPullRequestRow({
    repo: brandSchemas.repoName.parse('acme/lamps'),
    number: 7,
    attempt: attempt.id,
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
          kind: 'pr',
          ref: url,
          observed: null,
          source: 'hook',
          at: linkedAt,
        },
      },
    ],
    facts: [
      {
        id: factId,
        type: 'boxxy.evidence.pr_linked',
        entity: `boxxy:attempt:${attempt.id}`,
        actor: `boxxy:hook:${attempt.id}`,
        payload: { repo: pullRequest.repo, number: 7, url },
      },
    ],
  };
}
