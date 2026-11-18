import { expect, test } from 'bun:test';
import type { CloseOutContext, ItemShipped } from '@boxxy/model';
import { brandSchemas, liveCloseOutSchema, liveInputSchema, toJSONValue } from '@boxxy/model';
import { buildMockSettledAttemptRow } from '@boxxy/model/test-utils/build-mock-settled-attempt-row';
import { buildMockV1AttemptRow } from '@boxxy/model/test-utils/build-mock-v1-attempt-row';
import { buildMockV1ItemView } from '@boxxy/model/test-utils/build-mock-v1-item-view';
import { buildMockV1PullRequestRow } from '@boxxy/model/test-utils/build-mock-v1-pull-request-row';
import { live } from './live.ts';

function setupTest() {
  const commit = brandSchemas.commitSha.parse('3f2a91c0d4e5b6a7c8d9e0f1a2b3c4d5e6f7a8b9');
  const failing = { criterionId: 'a1', passed: false, evidence: 'The button is missing' };

  const bug = {
    kind: 'bug',
    title: 'Export button missing on live',
    body: 'The button does not render.',
    acceptance: [{ text: 'The export button shows on the live site', tags: ['prod'] }],
  };

  const item = buildMockV1ItemView({
    acceptance: [
      {
        id: brandSchemas.criterionId.parse('a1'),
        text: 'The export button shows on the live site',
        evidence: [],
        tags: ['prod'],
      },
    ],
  });

  const build = buildMockSettledAttemptRow({ phase: 'build', outcome: 'built', endedAt: 1000 });

  const pullRequest = buildMockV1PullRequestRow({
    attempt: build.id,
    state: 'merged',
    mergedAt: brandSchemas.instant.parse(2000),
    mergeCommit: commit,
  });

  const shipped: ItemShipped = {
    itemId: item.id,
    commit,
    rule: 'release',
    ref: 'v1.4.0',
    seenAt: brandSchemas.instant.parse(3000),
  };

  const input = liveInputSchema.parse({
    pullRequest: { repo: pullRequest.repo, number: pullRequest.number, url: pullRequest.url },
    commit,
    shipped,
    criteria: [{ id: 'a1', text: 'The export button shows on the live site', tags: ['prod'] }],
  });

  const buildContext = (overrides: Partial<CloseOutContext['world']> = {}): CloseOutContext => ({
    item,
    attempt: buildMockV1AttemptRow().id,
    evidence: [],
    world: {
      items: new Set([item.id]),
      kinds: new Set([brandSchemas.itemKindName.parse('bug')]),
      relationTypes: new Set([brandSchemas.relationTypeName.parse('relates-to')]),
      criterionTags: new Set(['prod']),
      ...overrides,
    },
    input: toJSONValue(input),
  });

  const closeOuts = {
    confirmed: { outcome: 'confirmed', lines: [{ ...failing, passed: true }] },
    broken: { outcome: 'broken', lines: [failing], bug },
    blocked: { outcome: 'blocked', reason: 'The line needs a write' },
    abandoned: { outcome: 'abandoned', reason: 'The site never loaded' },
  };

  return { item, build, pullRequest, shipped, input, buildContext, failing, bug, closeOuts };
}

test('it gives a live step the merged pull request, the commit, the shipped row and the tagged lines', () => {
  const ctx = setupTest();

  const input = live.input({
    item: ctx.item,
    attempt: buildMockV1AttemptRow().id,
    history: [ctx.build],
    retries: [],
    pullRequests: [ctx.pullRequest],
    shipped: [ctx.shipped],
    session: null,
  });

  expect(input).toStrictEqual(ctx.input);
});

test('it gives a live step with no merged commit null for the commit and the shipped row', () => {
  const ctx = setupTest();

  const input = live.input({
    item: ctx.item,
    attempt: buildMockV1AttemptRow().id,
    history: [],
    retries: [],
    pullRequests: [],
    shipped: [ctx.shipped],
    session: null,
  });

  expect(input).toStrictEqual({ ...ctx.input, pullRequest: null, commit: null, shipped: null });
});

test('it gives a live step only the shipped row of the merge commit', () => {
  const ctx = setupTest();
  const older = { ...ctx.shipped, commit: brandSchemas.commitSha.parse('b'.repeat(40)) };

  const input = live.input({
    item: ctx.item,
    attempt: buildMockV1AttemptRow().id,
    history: [ctx.build],
    retries: [],
    pullRequests: [ctx.pullRequest],
    shipped: [ctx.shipped, older],
    session: null,
  });

  expect(input).toMatchObject({ shipped: ctx.shipped });
});

test.each(['confirmed', 'broken', 'blocked', 'abandoned'] as const)(
  'it accepts a %s close-out',
  (outcome) => {
    const ctx = setupTest();
    const raw = ctx.closeOuts[outcome];
    const parsed: unknown = live.closeOut.parse(raw, ctx.buildContext());

    expect(parsed).toStrictEqual({ kind: 'valid', closeOut: raw });
  },
);

test('it rejects a bug whose kind is not bug', () => {
  const ctx = setupTest();
  const otherKind = brandSchemas.itemKindName.parse('core.issue');
  const context = ctx.buildContext({ kinds: new Set([otherKind]) });

  const parsed: unknown = live.closeOut.parse(
    { outcome: 'broken', lines: [ctx.failing], bug: { ...ctx.bug, kind: 'core.issue' } },
    context,
  );

  expect(parsed).toStrictEqual({
    kind: 'invalid',
    problems: [{ kind: 'phase-rule', message: 'the bug of a broken close-out has the kind bug' }],
  });
});

test('it rejects a line result for a criterion that is not in the input', () => {
  const ctx = setupTest();

  const parsed: unknown = live.closeOut.parse(
    { outcome: 'confirmed', lines: [{ criterionId: 'a9', passed: true, evidence: 'Seen' }] },
    ctx.buildContext(),
  );

  expect(parsed).toStrictEqual({
    kind: 'invalid',
    problems: [{ kind: 'unknown-criterion', criterion: 'a9' }],
  });
});

test('it rejects a broken close-out with no failing line', () => {
  const ctx = setupTest();

  const parsed: unknown = live.closeOut.parse(
    { outcome: 'broken', lines: [{ ...ctx.failing, passed: true }], bug: ctx.bug },
    ctx.buildContext(),
  );

  expect(parsed).toStrictEqual({
    kind: 'invalid',
    problems: [
      { kind: 'phase-rule', message: 'a broken close-out names at least one failing line' },
    ],
  });
});

test('it rejects a bug line with a tag the rules do not list', () => {
  const ctx = setupTest();

  const parsed: unknown = live.closeOut.parse(
    {
      outcome: 'broken',
      lines: [ctx.failing],
      bug: { ...ctx.bug, acceptance: [{ text: 'It shows', tags: ['staging'] }] },
    },
    ctx.buildContext(),
  );

  expect(parsed).toStrictEqual({
    kind: 'invalid',
    problems: [{ kind: 'unknown-criterion-tag', tag: 'staging' }],
  });
});

test('it rejects a broken close-out when the rules have no relates-to type', () => {
  const ctx = setupTest();

  const parsed: unknown = live.closeOut.parse(
    { outcome: 'broken', lines: [ctx.failing], bug: ctx.bug },
    ctx.buildContext({ relationTypes: new Set() }),
  );

  expect(parsed).toStrictEqual({
    kind: 'invalid',
    problems: [
      {
        kind: 'refused-relation',
        type: 'relates-to',
        target: ctx.item.id,
        reason: 'unknown-type',
      },
    ],
  });
});

test('it rejects a blocked close-out that sends a bug', () => {
  const ctx = setupTest();

  const parsed = live.closeOut.parse(
    { outcome: 'blocked', reason: 'Needs a write', bug: ctx.bug },
    ctx.buildContext(),
  );

  expect(parsed.kind).toBe('invalid');
});

test.each([
  { outcome: 'confirmed', state: 'succeeded', failure: null },
  { outcome: 'broken', state: 'succeeded', failure: null },
  { outcome: 'blocked', state: 'failed', failure: 'blocked' },
  { outcome: 'abandoned', state: 'failed', failure: 'abandoned' },
] as const)('it settles a $outcome live check', (row) => {
  const ctx = setupTest();

  const settlement = live.settle({
    attempt: buildMockV1AttemptRow({ phase: brandSchemas.phaseName.parse('live') }),
    item: ctx.item,
    closeOut: liveCloseOutSchema.parse(ctx.closeOuts[row.outcome]),
    now: brandSchemas.instant.parse(5000),
  });

  expect(settlement).toMatchObject({
    state: row.state,
    failure: row.failure,
    outcome: row.outcome,
    frictionDropped: 0,
  });
});

test('it files the bug of a broken live check and links it to the checked item', () => {
  const ctx = setupTest();

  const settlement = live.settle({
    attempt: buildMockV1AttemptRow({ phase: brandSchemas.phaseName.parse('live') }),
    item: ctx.item,
    closeOut: {
      outcome: 'broken',
      lines: [{ ...ctx.failing, criterionId: brandSchemas.criterionId.parse('a1') }],
      bug: {
        ...ctx.bug,
        kind: brandSchemas.itemKindName.parse('bug'),
      },
    },
    now: brandSchemas.instant.parse(5000),
  });

  const effects: unknown = settlement.effects;

  expect(effects).toStrictEqual([
    { kind: 'file-item', item: { ...ctx.bug, kind: 'bug' }, key: 'bug' },
    {
      kind: 'add-relation',
      link: {
        type: 'relates-to',
        from: { kind: 'open-item', key: 'bug' },
        to: { kind: 'item' },
      },
    },
  ]);
});

test('it files nothing for a confirmed live check', () => {
  const ctx = setupTest();

  const settlement = live.settle({
    attempt: buildMockV1AttemptRow({ phase: brandSchemas.phaseName.parse('live') }),
    item: ctx.item,
    closeOut: { outcome: 'confirmed', lines: [] },
    now: brandSchemas.instant.parse(5000),
  });

  expect(settlement.effects).toStrictEqual([]);
});
