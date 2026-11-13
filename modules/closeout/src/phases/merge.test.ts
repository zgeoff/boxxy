import { expect, test } from 'bun:test';
import { brandSchemas, toJSONValue } from '@boxxy/model';
import { buildMockMergeCloseOut } from '@boxxy/model/test-utils/build-mock-merge-close-out';
import { buildMockV1AttemptRow } from '@boxxy/model/test-utils/build-mock-v1-attempt-row';
import { buildMockV1ItemView } from '@boxxy/model/test-utils/build-mock-v1-item-view';
import { buildMockV1PullRequestRow } from '@boxxy/model/test-utils/build-mock-v1-pull-request-row';
import { merge } from './merge.ts';

test('it gives a merge the latest pull request of the item', () => {
  const older = buildMockV1PullRequestRow({ number: 3 });
  const latest = buildMockV1PullRequestRow({ number: 4 });

  const input = merge.input({
    item: buildMockV1ItemView(),
    attempt: buildMockV1AttemptRow().id,
    history: [],
    retries: [],
    pullRequests: [older, latest],
    session: null,
  });

  expect(input).toStrictEqual({
    pullRequest: { repo: latest.repo, number: latest.number, url: latest.url },
  });
});

test('it settles a merged merge as succeeded, and asks to record the merge of its pull request', () => {
  const mergeCommit = brandSchemas.commitSha.parse('ffeeddccbbaa99887766554433221100ffeeddcc');
  const repo = brandSchemas.repoName.parse('acme/lamps');

  const settlement: unknown = merge.settle({
    attempt: buildMockV1AttemptRow({
      phase: brandSchemas.phaseName.parse('merge'),
      input: toJSONValue({
        pullRequest: { repo, number: 7, url: 'https://github.com/acme/lamps/pull/7' },
      }),
    }),
    item: buildMockV1ItemView(),
    closeOut: buildMockMergeCloseOut({ mergeCommit }),
    now: brandSchemas.instant.parse(5000),
  });

  expect(settlement).toStrictEqual({
    state: 'succeeded',
    failure: null,
    outcome: 'merged',
    effects: [{ kind: 'record-merge', pullRequest: { repo, number: 7 }, mergeCommit }],
    frictionDropped: 0,
  });
});

test.each(['repair', 'stale', 'unverified', 'closed', 'stalled', 'refused'] as const)(
  'it settles a %s merge as failed with that outcome and no effect',
  (outcome) => {
    const settlement: unknown = merge.settle({
      attempt: buildMockV1AttemptRow({
        phase: brandSchemas.phaseName.parse('merge'),
        input: toJSONValue({ pullRequest: null }),
      }),
      item: buildMockV1ItemView(),
      closeOut: buildMockMergeCloseOut({ outcome, mergeCommit: null, byBoxxy: false }),
      now: brandSchemas.instant.parse(5000),
    });

    expect(settlement).toStrictEqual({
      state: 'failed',
      failure: outcome,
      outcome,
      effects: [],
      frictionDropped: 0,
    });
  },
);

test('it refuses a merge close-out with a field that the merge close-out has no place for', () => {
  const item = buildMockV1ItemView();

  const parsed = merge.closeOut.parse(
    { ...buildMockMergeCloseOut(), pending: ['pr / checks'] },
    {
      item,
      attempt: buildMockV1AttemptRow().id,
      evidence: [],
      world: { items: new Set([item.id]), kinds: new Set(), relationTypes: new Set() },
      input: { pullRequest: null },
    },
  );

  expect(parsed.kind).toBe('invalid');
});
