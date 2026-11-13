import { expect, test } from 'bun:test';
import { brandSchemas, toJSONValue } from '@boxxy/model';
import { buildMockMergeCloseOut } from '@boxxy/model/test-utils/build-mock-merge-close-out';
import { buildMockMergeObservation } from '@boxxy/model/test-utils/build-mock-merge-observation';
import { decideMerge } from './decide-merge.ts';
import type { DecideMergeInput } from './types.ts';

function setupTest() {
  return {
    // the rules require `pr / checks` and merge with a squash; nothing has been asked yet
    decide: (input: Partial<DecideMergeInput>) =>
      decideMerge({
        observed: buildMockMergeObservation(),
        rules: { method: 'squash', checks: ['pr / checks'] },
        deadlinePassed: false,
        acted: null,
        now: brandSchemas.instant.parse(1_900_000_000_000),
        actRetryMinutes: 5,
        ...input,
      }),
  };
}

test.each([
  [{ state: 'unreadable', problem: 'no-pull-request' } as const, 'the item has no pull request'],
  [
    {
      state: 'unreadable',
      problem: 'pull-request-not-found',
      pullRequest: { repo: brandSchemas.repoName.parse('acme/lamps'), number: 7 },
    } as const,
    'the forge holds no pull request acme/lamps#7',
  ],
  [
    {
      state: 'unreadable',
      problem: 'no-commit',
      pullRequest: { repo: brandSchemas.repoName.parse('acme/lamps'), number: 7 },
    } as const,
    'the pull request acme/lamps#7 has no commit',
  ],
])('it finishes blocked with the reason for an unreadable merge: %o', (observed, reason) => {
  const ctx = setupTest();

  expect(ctx.decide({ observed })).toStrictEqual({
    kind: 'finish',
    closeOut: toJSONValue(
      buildMockMergeCloseOut({
        outcome: 'blocked',
        head: null,
        required: [],
        failed: [],
        cause: null,
        mergeCommit: null,
        reason,
        byBoxxy: false,
        verify: null,
      }),
    ),
  });
});

test('it finishes merged, not by boxxy, for a pull request that someone else merged', () => {
  const ctx = setupTest();
  const mergeCommit = brandSchemas.commitSha.parse('ffeeddccbbaa99887766554433221100ffeeddcc');
  const observed = buildMockMergeObservation({ state: 'merged', mergeCommit });

  expect(ctx.decide({ observed })).toStrictEqual({
    kind: 'finish',
    closeOut: toJSONValue(
      buildMockMergeCloseOut({
        outcome: 'merged',
        head: observed.head,
        required: ['pr / checks'],
        failed: [],
        cause: null,
        mergeCommit,
        reason: null,
        byBoxxy: false,
        verify: observed.verify,
      }),
    ),
  });
});

test('it finishes merged by boxxy when boxxy asked to merge the head that merged', () => {
  const ctx = setupTest();
  const mergeCommit = brandSchemas.commitSha.parse('ffeeddccbbaa99887766554433221100ffeeddcc');
  const observed = buildMockMergeObservation({ state: 'merged', mergeCommit });

  const step = ctx.decide({
    observed,
    acted: { at: brandSchemas.instant.parse(1000), head: observed.head, answer: null },
    now: brandSchemas.instant.parse(61_000),
  });

  expect(step).toStrictEqual({
    kind: 'finish',
    closeOut: toJSONValue(
      buildMockMergeCloseOut({
        outcome: 'merged',
        head: observed.head,
        required: ['pr / checks'],
        failed: [],
        cause: null,
        mergeCommit,
        reason: null,
        byBoxxy: true,
        verify: observed.verify,
      }),
    ),
  });
});

test('it finishes closed for a pull request closed with no merge', () => {
  const ctx = setupTest();
  const observed = buildMockMergeObservation({ state: 'closed' });

  expect(ctx.decide({ observed })).toStrictEqual({
    kind: 'finish',
    closeOut: toJSONValue(
      buildMockMergeCloseOut({
        outcome: 'closed',
        head: observed.head,
        required: ['pr / checks'],
        failed: [],
        cause: null,
        mergeCommit: null,
        reason: null,
        byBoxxy: false,
        verify: observed.verify,
      }),
    ),
  });
});

test.each([
  ['passed at another head', 'passed', '0b1d2c3a4f5e6d7c8b9a0f1e2d3c4b5a69788776'],
  ['was blocked at the head', 'blocked', null],
] as const)('it finishes stale when the latest review %s', (_case, status, otherHead) => {
  const ctx = setupTest();
  const head = brandSchemas.commitSha.parse('e83c5163316f89bfbde7d9ab23ca2e25604af290');

  const observed = buildMockMergeObservation({
    head,
    review: {
      head: brandSchemas.commitSha.parse(otherHead ?? head),
      status,
      attempt: brandSchemas.attemptId.parse('0190a6f4-0000-7000-8000-000000000042'),
    },
  });

  expect(ctx.decide({ observed })).toStrictEqual({
    kind: 'finish',
    closeOut: toJSONValue(
      buildMockMergeCloseOut({
        outcome: 'stale',
        head,
        required: ['pr / checks'],
        failed: [],
        cause: null,
        mergeCommit: null,
        reason: null,
        byBoxxy: false,
        verify: observed.verify,
      }),
    ),
  });
});

test('it finishes stale for an item with no settled review', () => {
  const ctx = setupTest();
  const observed = buildMockMergeObservation({ review: null });

  expect(ctx.decide({ observed })).toStrictEqual({
    kind: 'finish',
    closeOut: toJSONValue(
      buildMockMergeCloseOut({
        outcome: 'stale',
        head: observed.head,
        required: ['pr / checks'],
        failed: [],
        cause: null,
        mergeCommit: null,
        reason: null,
        byBoxxy: false,
        verify: observed.verify,
      }),
    ),
  });
});

test('it finishes repair for a conflict with the base', () => {
  const ctx = setupTest();
  const observed = buildMockMergeObservation({ mergeable: 'conflict' });

  expect(ctx.decide({ observed })).toStrictEqual({
    kind: 'finish',
    closeOut: toJSONValue(
      buildMockMergeCloseOut({
        outcome: 'repair',
        head: observed.head,
        required: ['pr / checks'],
        failed: [],
        cause: 'conflict',
        mergeCommit: null,
        reason: null,
        byBoxxy: false,
        verify: observed.verify,
      }),
    ),
  });
});

test('it finishes repair with the red checks when a check the base branch requires failed', () => {
  const ctx = setupTest();

  const observed = buildMockMergeObservation({
    baseRequired: ['build'],
    checks: new Map([
      ['pr / checks', 'success'],
      ['build', 'failure'],
    ]),
  });

  expect(ctx.decide({ observed })).toStrictEqual({
    kind: 'finish',
    closeOut: toJSONValue(
      buildMockMergeCloseOut({
        outcome: 'repair',
        head: observed.head,
        required: ['pr / checks', 'build'],
        failed: ['build'],
        cause: 'checks-red',
        mergeCommit: null,
        reason: null,
        byBoxxy: false,
        verify: observed.verify,
      }),
    ),
  });
});

test.each([
  ['pending', new Map([['pr / checks', 'pending']] as const)],
  ['skipped', new Map([['pr / checks', 'other']] as const)],
  ['missing', new Map()],
])('it waits within the time limit while a required check is %s', (_state, checks) => {
  const ctx = setupTest();

  expect(ctx.decide({ observed: buildMockMergeObservation({ checks }) })).toStrictEqual({
    kind: 'wait',
    reason: 'checks pending',
    pending: ['pr / checks'],
  });
});

test('it waits within the time limit while the mergeable state is unknown', () => {
  const ctx = setupTest();

  expect(
    ctx.decide({ observed: buildMockMergeObservation({ mergeable: 'unknown' }) }),
  ).toStrictEqual({ kind: 'wait', reason: 'mergeable state unknown', pending: [] });
});

test('it finishes stalled while a required check is pending past the time limit', () => {
  const ctx = setupTest();
  const observed = buildMockMergeObservation({ checks: new Map([['pr / checks', 'pending']]) });

  expect(ctx.decide({ observed, deadlinePassed: true })).toStrictEqual({
    kind: 'finish',
    closeOut: toJSONValue(
      buildMockMergeCloseOut({
        outcome: 'stalled',
        head: observed.head,
        required: ['pr / checks'],
        failed: [],
        cause: null,
        mergeCommit: null,
        reason: null,
        byBoxxy: false,
        verify: observed.verify,
      }),
    ),
  });
});

test('it finishes unverified when every check is green and the verify reading is incomplete', () => {
  const ctx = setupTest();
  const head = brandSchemas.commitSha.parse('e83c5163316f89bfbde7d9ab23ca2e25604af290');
  const verify = { status: 'incomplete', head, features: [] } as const;
  const observed = buildMockMergeObservation({ head, verify });

  expect(ctx.decide({ observed })).toStrictEqual({
    kind: 'finish',
    closeOut: toJSONValue(
      buildMockMergeCloseOut({
        outcome: 'unverified',
        head,
        required: ['pr / checks'],
        failed: [],
        cause: null,
        mergeCommit: null,
        reason: null,
        byBoxxy: false,
        verify,
      }),
    ),
  });
});

test('it finishes refused when the forge refused the merge of this clean, green head', () => {
  const ctx = setupTest();
  const observed = buildMockMergeObservation();

  const step = ctx.decide({
    observed,
    acted: {
      at: brandSchemas.instant.parse(1000),
      head: observed.head,
      answer: { kind: 'not-mergeable', reason: 'Base branch was modified' },
    },
    now: brandSchemas.instant.parse(61_000),
  });

  expect(step).toStrictEqual({
    kind: 'finish',
    closeOut: toJSONValue(
      buildMockMergeCloseOut({
        outcome: 'refused',
        head: observed.head,
        required: ['pr / checks'],
        failed: [],
        cause: null,
        mergeCommit: null,
        reason: 'Base branch was modified',
        byBoxxy: false,
        verify: observed.verify,
      }),
    ),
  });
});

test('it finishes stalled when a merge request sent at this head has no merge past the time limit', () => {
  const ctx = setupTest();
  const observed = buildMockMergeObservation();

  const step = ctx.decide({
    observed,
    acted: { at: brandSchemas.instant.parse(1000), head: observed.head, answer: null },
    now: brandSchemas.instant.parse(61_000),
    deadlinePassed: true,
  });

  expect(step).toStrictEqual({
    kind: 'finish',
    closeOut: toJSONValue(
      buildMockMergeCloseOut({
        outcome: 'stalled',
        head: observed.head,
        required: ['pr / checks'],
        failed: [],
        cause: null,
        mergeCommit: null,
        reason: null,
        byBoxxy: false,
        verify: observed.verify,
      }),
    ),
  });
});

test('it waits when a merge request sent at this head is less than 5 minutes old', () => {
  const ctx = setupTest();
  const observed = buildMockMergeObservation();

  const step = ctx.decide({
    observed,
    acted: { at: brandSchemas.instant.parse(1000), head: observed.head, answer: null },
    now: brandSchemas.instant.parse(1000 + 4 * 60_000),
  });

  expect(step).toStrictEqual({ kind: 'wait', reason: 'merge requested', pending: [] });
});

test('it asks again to merge when a request at this head got no answer in 5 minutes', () => {
  const ctx = setupTest();
  const observed = buildMockMergeObservation();

  const step = ctx.decide({
    observed,
    acted: { at: brandSchemas.instant.parse(1000), head: observed.head, answer: null },
    now: brandSchemas.instant.parse(1000 + 5 * 60_000),
  });

  expect(step).toStrictEqual({
    kind: 'act',
    action: {
      kind: 'merge',
      unit: { members: [{ pullRequest: observed.pullRequest, head: observed.head }] },
      method: 'squash',
      required: ['pr / checks'],
    },
  });
});

test('it asks to merge a head that moved since the last request', () => {
  const ctx = setupTest();
  const observed = buildMockMergeObservation();

  const step = ctx.decide({
    observed,
    acted: {
      at: brandSchemas.instant.parse(1000),
      head: brandSchemas.commitSha.parse('0b1d2c3a4f5e6d7c8b9a0f1e2d3c4b5a69788776'),
      answer: { kind: 'not-mergeable', reason: 'Head moved' },
    },
    now: brandSchemas.instant.parse(61_000),
  });

  expect(step).toStrictEqual({
    kind: 'act',
    action: {
      kind: 'merge',
      unit: { members: [{ pullRequest: observed.pullRequest, head: observed.head }] },
      method: 'squash',
      required: ['pr / checks'],
    },
  });
});

test('it asks to merge the head when every check is green and the verify reading is verified', () => {
  const ctx = setupTest();
  const observed = buildMockMergeObservation();

  expect(ctx.decide({ observed })).toStrictEqual({
    kind: 'act',
    action: {
      kind: 'merge',
      unit: { members: [{ pullRequest: observed.pullRequest, head: observed.head }] },
      method: 'squash',
      required: ['pr / checks'],
    },
  });
});

test('it names each required check once when the rules and the base branch both require it', () => {
  const ctx = setupTest();

  const observed = buildMockMergeObservation({
    baseRequired: ['pr / checks', 'build'],
    checks: new Map(),
  });

  expect(ctx.decide({ observed })).toStrictEqual({
    kind: 'wait',
    reason: 'checks pending',
    pending: ['pr / checks', 'build'],
  });
});
