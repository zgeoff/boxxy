import { expect, test } from 'bun:test';
import type { BuildCloseOut, CloseOutContext, CommitSha, EvidenceRow } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { buildMockEvidenceRow } from '@boxxy/model/test-utils/build-mock-evidence-row';
import { buildMockV1ItemView } from '@boxxy/model/test-utils/build-mock-v1-item-view';
import { collectStaleEvidenceProblems } from './collect-stale-evidence-problems.ts';

function setupTest() {
  const criterion = brandSchemas.criterionId.parse('a1');

  return {
    criterion,
    olderHead: brandSchemas.commitSha.parse('1'.repeat(40)),
    currentHead: brandSchemas.commitSha.parse('2'.repeat(40)),
    closeOut: (row: EvidenceRow, kind: 'built' | 'blocked' = 'built'): BuildCloseOut => ({
      result: kind === 'built' ? { kind } : { kind, reason: 'CI is down' },
      criteria: [{ criterion, evidence: row.factId }],
      openItems: [],
      friction: [],
      frictionDropped: 0,
    }),
    context: (
      row: EvidenceRow,
      head: CommitSha | null,
      noHeadCause?: CloseOutContext['noHeadCause'],
    ): CloseOutContext => ({
      item: buildMockV1ItemView(),
      attempt: row.attempt,
      evidence: [row],
      head,
      ...(noHeadCause === undefined ? {} : { noHeadCause }),
      world: {
        items: new Set(),
        kinds: new Set(),
        relationTypes: new Set(),
        criterionTags: new Set(),
      },
      input: null,
    }),
  };
}

test.each(['check', 'verdict'] as const)(
  'it flags a cited %s recorded at an older head',
  (kind) => {
    const ctx = setupTest();
    const row = buildMockEvidenceRow({ kind, head: ctx.olderHead });

    expect(
      collectStaleEvidenceProblems(ctx.closeOut(row), ctx.context(row, ctx.currentHead)),
    ).toStrictEqual([
      {
        kind: 'stale-evidence',
        criterion: ctx.criterion,
        evidence: row.factId,
        recordedAt: ctx.olderHead,
        head: ctx.currentHead,
        cause: null,
      },
    ]);
  },
);

test('it flags a cited check with a null head when the pull request is closed or merged', () => {
  const ctx = setupTest();
  const row = buildMockEvidenceRow({ kind: 'check', head: ctx.olderHead });

  expect(collectStaleEvidenceProblems(ctx.closeOut(row), ctx.context(row, null))).toStrictEqual([
    {
      kind: 'stale-evidence',
      criterion: ctx.criterion,
      evidence: row.factId,
      recordedAt: ctx.olderHead,
      head: null,
      cause: 'closed',
    },
  ]);
});

test.each(['no-forge', 'no-pull-request', 'not-found'] as const)(
  'it flags a cited check with the cause %s when no head was read',
  (cause) => {
    const ctx = setupTest();
    const row = buildMockEvidenceRow({ kind: 'check', head: ctx.olderHead });

    expect(
      collectStaleEvidenceProblems(ctx.closeOut(row), ctx.context(row, null, cause)),
    ).toStrictEqual([
      {
        kind: 'stale-evidence',
        criterion: ctx.criterion,
        evidence: row.factId,
        recordedAt: ctx.olderHead,
        head: null,
        cause,
      },
    ]);
  },
);

test('it flags nothing for a check recorded at the current head', () => {
  const ctx = setupTest();
  const row = buildMockEvidenceRow({ kind: 'check', head: ctx.currentHead });

  expect(
    collectStaleEvidenceProblems(ctx.closeOut(row), ctx.context(row, ctx.currentHead)),
  ).toStrictEqual([]);
});

test.each(['test', 'ci-run', 'live-check'] as const)(
  'it never flags a %s, which has no head',
  (kind) => {
    const ctx = setupTest();
    const row = buildMockEvidenceRow({ kind });

    expect(
      collectStaleEvidenceProblems(ctx.closeOut(row), ctx.context(row, ctx.currentHead)),
    ).toStrictEqual([]);
  },
);

test('it flags nothing for a blocked close-out, whose head is never read', () => {
  const ctx = setupTest();
  const row = buildMockEvidenceRow({ kind: 'check', head: ctx.olderHead });

  expect(
    collectStaleEvidenceProblems(ctx.closeOut(row, 'blocked'), ctx.context(row, null)),
  ).toStrictEqual([]);
});
