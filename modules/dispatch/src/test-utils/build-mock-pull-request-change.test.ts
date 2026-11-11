import { expect, test } from 'bun:test';
import { buildMockV1AttemptRow } from '@boxxy/model/test-utils/build-mock-v1-attempt-row';
import { buildMockPullRequestChange } from './build-mock-pull-request-change.ts';

test('it builds a change that links pull request 7 with its evidence row and fact', () => {
  const attempt = buildMockV1AttemptRow();
  const change: unknown = buildMockPullRequestChange({ attempt, state: 'merged' });

  expect(change).toStrictEqual({
    at: 4000,
    writes: [
      {
        op: 'insert',
        table: 'pull_requests',
        row: {
          repo: 'acme/lamps',
          number: 7,
          attempt: attempt.id,
          githubId: 2_000_007,
          url: 'https://github.com/acme/lamps/pull/7',
          state: 'merged',
          mergedAt: null,
          mergeCommit: null,
          checkedAt: 4000,
        },
      },
      {
        op: 'insert',
        table: 'evidence',
        row: {
          factId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-7/u),
          attempt: attempt.id,
          kind: 'pull_request',
          ref: 'https://github.com/acme/lamps/pull/7',
          observed: null,
          source: 'hook',
          at: 4000,
        },
      },
    ],
    facts: [
      {
        id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-7/u),
        type: 'boxxy.pull_request.linked',
        entity: `boxxy:item:${attempt.item}`,
        actor: `boxxy:hook:${attempt.id}`,
        payload: {
          attempt: attempt.id,
          repo: 'acme/lamps',
          number: 7,
          url: 'https://github.com/acme/lamps/pull/7',
          pullRequestId: '2000007',
          source: 'hook',
        },
      },
    ],
  });
});

test('it links the pull request number it is given in the row, the evidence and the fact', () => {
  const attempt = buildMockV1AttemptRow();
  const change = buildMockPullRequestChange({ attempt, state: 'open', number: 8 });
  const linked: unknown = { writes: change.writes, payload: change.facts[0]?.payload };

  expect(linked).toStrictEqual({
    writes: [
      expect.objectContaining({ row: expect.objectContaining({ number: 8 }) }),
      expect.objectContaining({
        row: expect.objectContaining({ ref: 'https://github.com/acme/lamps/pull/8' }),
      }),
    ],
    payload: expect.objectContaining({
      number: 8,
      url: 'https://github.com/acme/lamps/pull/8',
      pullRequestId: '2000008',
    }),
  });
});
