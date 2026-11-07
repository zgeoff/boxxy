import { expect, test } from 'bun:test';
import { buildMockAttemptRow } from '@boxxy/model/test-utils/build-mock-attempt-row';
import { buildMockPullRequestChange } from './build-mock-pull-request-change.ts';

test('it builds a change that links PR 7 with its evidence row and fact', () => {
  const attempt = buildMockAttemptRow();
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
          factId: expect.stringMatching(/^manual:/u),
          attempt: attempt.id,
          kind: 'pr',
          ref: 'https://github.com/acme/lamps/pull/7',
          observed: null,
          source: 'hook',
          at: 4000,
        },
      },
    ],
    facts: [
      {
        id: expect.stringMatching(/^manual:/u),
        type: 'boxxy.evidence.pr_linked',
        entity: `boxxy:attempt:${attempt.id}`,
        actor: `boxxy:hook:${attempt.id}`,
        payload: { repo: 'acme/lamps', number: 7, url: 'https://github.com/acme/lamps/pull/7' },
      },
    ],
  });
});
