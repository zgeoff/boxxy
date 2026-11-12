import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { buildMockV1AttemptRow } from '@boxxy/model/test-utils/build-mock-v1-attempt-row';
import { buildMockV1ItemView } from '@boxxy/model/test-utils/build-mock-v1-item-view';
import { buildMockV1PullRequestRow } from '@boxxy/model/test-utils/build-mock-v1-pull-request-row';
import { z } from 'zod';
import { buildMockNoslopReport } from '../test-utils/build-mock-noslop-report.ts';
import { review } from './review.ts';

test('it stores the summary of the noslop report in place of the report the session sent', () => {
  const item = buildMockV1ItemView();
  const report = buildMockNoslopReport({ findings: [{ title: 'The retry runs twice' }] });

  const finding = {
    title: 'The retry runs twice',
    body: 'A second click sends a second upload',
    path: 'src/upload.ts',
    line: 41,
  };

  const raw = {
    verdict: { kind: 'changes-requested', findings: [finding] },
    noslop: report,
    friction: [],
  };

  const parsed: unknown = review.closeOut.parse(raw, {
    item,
    attempt: buildMockV1AttemptRow().id,
    evidence: [],
    world: { items: new Set([item.id]), kinds: new Set(), relationTypes: new Set() },
  });

  expect(parsed).toStrictEqual({
    kind: 'valid',
    closeOut: {
      verdict: { kind: 'changes-requested', findings: [finding] },
      noslop: {
        version: 7,
        reviewID: report.reviewID,
        head: report.head,
        counts: { findings: 1, failedCalls: 0, fixChecks: 0 },
        reportBytes: new TextEncoder().encode(JSON.stringify(report)).length,
        report,
      },
      friction: [],
      frictionDropped: 0,
    },
  });
});

test('it returns both problems of a review with an untitled finding and a short head', () => {
  const item = buildMockV1ItemView();

  const raw = {
    verdict: { kind: 'changes-requested', findings: [{ body: 'A second click uploads again' }] },
    noslop: { ...buildMockNoslopReport(), head: 'e83c516' },
    friction: [],
  };

  const parsed: unknown = review.closeOut.parse(raw, {
    item,
    attempt: buildMockV1AttemptRow().id,
    evidence: [],
    world: { items: new Set([item.id]), kinds: new Set(), relationTypes: new Set() },
  });

  expect(parsed).toStrictEqual({
    kind: 'invalid',
    problems: expect.toIncludeSameMembers([
      { kind: 'schema', path: 'verdict.findings[0].title', message: expect.any(String) },
      { kind: 'schema', path: 'noslop.head', message: expect.any(String) },
    ]),
  });
});

test('it rejects a review that requests changes with no finding', () => {
  const item = buildMockV1ItemView();

  const raw = {
    verdict: { kind: 'changes-requested', findings: [] },
    noslop: buildMockNoslopReport(),
    friction: [],
  };

  const parsed: unknown = review.closeOut.parse(raw, {
    item,
    attempt: buildMockV1AttemptRow().id,
    evidence: [],
    world: { items: new Set([item.id]), kinds: new Set(), relationTypes: new Set() },
  });

  expect(parsed).toStrictEqual({
    kind: 'invalid',
    problems: [{ kind: 'phase-rule', message: 'changes-requested needs at least one finding' }],
  });
});

test('it rejects a review that is over 120,000 bytes as stored, with its size', () => {
  const item = buildMockV1ItemView();

  const findings = Array.from({ length: 32 }, () => ({
    title: 'a finding',
    body: '"'.repeat(1900),
  }));

  const report = buildMockNoslopReport();

  const raw = {
    verdict: { kind: 'changes-requested', findings },
    noslop: report,
    friction: [],
  };

  const stored = {
    verdict: raw.verdict,
    noslop: {
      version: 7,
      reviewID: report.reviewID,
      head: report.head,
      counts: { findings: 0, failedCalls: 0, fixChecks: 0 },
      reportBytes: new TextEncoder().encode(JSON.stringify(report)).length,
      report,
    },
    friction: [],
    frictionDropped: 0,
  };

  const parsed: unknown = review.closeOut.parse(raw, {
    item,
    attempt: buildMockV1AttemptRow().id,
    evidence: [],
    world: { items: new Set([item.id]), kinds: new Set(), relationTypes: new Set() },
  });

  expect(parsed).toStrictEqual({
    kind: 'invalid',
    problems: [
      {
        kind: 'too-large',
        bytes: new TextEncoder().encode(JSON.stringify(stored)).length,
        max: 120_000,
      },
    ],
  });
});

test('it settles a passed review as succeeded, with a proposal for each friction entry', () => {
  const friction = { target: { kind: 'tool', name: 'noslop' }, change: 'Print the head' };

  const settlement: unknown = review.settle({
    attempt: buildMockV1AttemptRow({ phase: brandSchemas.phaseName.parse('review') }),
    item: buildMockV1ItemView(),
    closeOut: {
      verdict: { kind: 'passed' },
      noslop: {
        version: 7,
        reviewID: 'review-3c9a',
        head: 'e83c5163316f89bfbde7d9ab23ca2e25604af290',
        counts: { findings: 0, failedCalls: 0, fixChecks: 0 },
        reportBytes: 2048,
        report: null,
      },
      friction: [friction],
      frictionDropped: 2,
    },
    now: brandSchemas.instant.parse(1000),
  });

  expect(settlement).toStrictEqual({
    state: 'succeeded',
    failure: null,
    outcome: 'passed',
    effects: [{ kind: 'record-proposal', friction }],
    frictionDropped: 2,
  });
});

test('it gives a review the acceptance list, the design and the latest pull request', () => {
  const item = buildMockV1ItemView({
    acceptance: [{ id: brandSchemas.criterionId.parse('a1'), text: 'Retries once', evidence: [] }],
  });

  const history = [
    buildMockV1AttemptRow({
      phase: brandSchemas.phaseName.parse('design'),
      state: 'succeeded',
      closeOut: {
        result: {
          kind: 'designed',
          design: { text: 'Retry once', location: 'docs/design/upload.md' },
        },
        friction: [],
        frictionDropped: 0,
      },
    }),
  ];

  const older = buildMockV1PullRequestRow();
  const latest = buildMockV1PullRequestRow();

  expect(review.input({ item, history, pullRequests: [older, latest] })).toStrictEqual({
    acceptance: [{ id: 'a1', text: 'Retries once' }],
    design: { text: 'Retry once', location: 'docs/design/upload.md' },
    pullRequest: { repo: latest.repo, number: latest.number, url: latest.url },
  });
});

test('it tells the session to send the noslop report, not the summary', () => {
  const noslopSchema = z.object({ required: z.array(z.string()) });
  const bodySchema = z.object({ properties: z.object({ noslop: noslopSchema }) });
  const schema = bodySchema.parse(review.closeOut.jsonSchema);

  expect(schema.properties.noslop.required).toStrictEqual([
    'version',
    'reviewID',
    'head',
    'findings',
    'failedCalls',
  ]);
});
