import { expect, test } from 'bun:test';
import { brandSchemas, closeOutSchema } from '@boxxy/model';
import { buildMockEvidenceRow } from '@boxxy/model/test-utils/build-mock-evidence-row';
import { buildMockFactId } from '@boxxy/model/test-utils/build-mock-fact-id';
import { buildMockGateReading } from '@boxxy/model/test-utils/build-mock-gate-reading';
import { buildMockSettledAttemptRow } from '@boxxy/model/test-utils/build-mock-settled-attempt-row';
import { buildMockV1AttemptRow } from '@boxxy/model/test-utils/build-mock-v1-attempt-row';
import { buildMockV1ItemView } from '@boxxy/model/test-utils/build-mock-v1-item-view';
import { buildMockV1PullRequestRow } from '@boxxy/model/test-utils/build-mock-v1-pull-request-row';
import { build } from './build.ts';

test('it accepts a built close-out that cites the attempt evidence for every criterion', () => {
  const item = buildMockV1ItemView({
    acceptance: [{ id: brandSchemas.criterionId.parse('a1'), text: 'Retries once', evidence: [] }],
  });

  const row = buildMockEvidenceRow();

  const raw = {
    result: { kind: 'built' },
    criteria: [{ criterion: 'a1', evidence: row.factId }],
    openItems: [{ kind: 'core.issue', title: 'Show upload progress', body: 'Uploads look stuck' }],
    friction: [{ target: { kind: 'lint', name: 'max-depth' }, change: 'Allow 5 in parsers' }],
  };

  const parsed: unknown = build.closeOut.parse(raw, {
    item,
    attempt: row.attempt,
    evidence: [row],
    world: { items: new Set([item.id]), kinds: new Set(), relationTypes: new Set() },
    input: null,
  });

  expect(parsed).toStrictEqual({
    kind: 'valid',
    closeOut: { ...raw, frictionDropped: 0 },
  });
});

test('it accepts a blocked close-out that cites no evidence', () => {
  const item = buildMockV1ItemView({
    acceptance: [{ id: brandSchemas.criterionId.parse('a1'), text: 'Retries once', evidence: [] }],
  });

  const row = buildMockEvidenceRow();

  const raw = {
    result: { kind: 'blocked', reason: 'The upload service is down' },
    criteria: [],
    openItems: [],
    friction: [],
  };

  const parsed: unknown = build.closeOut.parse(raw, {
    item,
    attempt: row.attempt,
    evidence: [row],
    world: { items: new Set([item.id]), kinds: new Set(), relationTypes: new Set() },
    input: null,
  });

  expect(parsed).toStrictEqual({
    kind: 'valid',
    closeOut: { ...raw, frictionDropped: 0 },
  });
});

test('it rejects a close-out that fails the schema, with the path of the bad field', () => {
  const item = buildMockV1ItemView();
  const row = buildMockEvidenceRow();
  const raw = { result: { kind: 'shipped' }, criteria: [], openItems: [], friction: [] };

  const parsed: unknown = build.closeOut.parse(raw, {
    item,
    attempt: row.attempt,
    evidence: [row],
    world: { items: new Set([item.id]), kinds: new Set(), relationTypes: new Set() },
    input: null,
  });

  expect(parsed).toStrictEqual({
    kind: 'invalid',
    problems: [{ kind: 'schema', path: 'result.kind', message: expect.any(String) }],
  });
});

test('it rejects a close-out that cites a criterion the item lacks', () => {
  const item = buildMockV1ItemView({
    acceptance: [{ id: brandSchemas.criterionId.parse('a1'), text: 'Retries once', evidence: [] }],
  });

  const row = buildMockEvidenceRow();

  const raw = {
    result: { kind: 'abandoned', reason: 'The item is out of date' },
    criteria: [{ criterion: 'a7', evidence: row.factId }],
    openItems: [],
    friction: [],
  };

  const parsed: unknown = build.closeOut.parse(raw, {
    item,
    attempt: row.attempt,
    evidence: [row],
    world: { items: new Set([item.id]), kinds: new Set(), relationTypes: new Set() },
    input: null,
  });

  expect(parsed).toStrictEqual({
    kind: 'invalid',
    problems: [{ kind: 'unknown-criterion', criterion: 'a7' }],
  });
});

test('it rejects a close-out that cites evidence of another attempt', () => {
  const item = buildMockV1ItemView({
    acceptance: [{ id: brandSchemas.criterionId.parse('a1'), text: 'Retries once', evidence: [] }],
  });

  const row = buildMockEvidenceRow();
  const other = buildMockEvidenceRow();

  const raw = {
    result: { kind: 'abandoned', reason: 'The item is out of date' },
    criteria: [{ criterion: 'a1', evidence: other.factId }],
    openItems: [],
    friction: [],
  };

  const parsed: unknown = build.closeOut.parse(raw, {
    item,
    attempt: row.attempt,
    evidence: [row],
    world: { items: new Set([item.id]), kinds: new Set(), relationTypes: new Set() },
    input: null,
  });

  expect(parsed).toStrictEqual({
    kind: 'invalid',
    problems: [{ kind: 'foreign-evidence', evidence: other.factId }],
  });
});

test('it rejects a built close-out with a criterion that has no evidence', () => {
  const item = buildMockV1ItemView({
    acceptance: [
      { id: brandSchemas.criterionId.parse('a1'), text: 'Retries once', evidence: [] },
      { id: brandSchemas.criterionId.parse('a2'), text: 'Logs the retry', evidence: [] },
    ],
  });

  const row = buildMockEvidenceRow();

  const raw = {
    result: { kind: 'built' },
    criteria: [{ criterion: 'a1', evidence: row.factId }],
    openItems: [],
    friction: [],
  };

  const parsed: unknown = build.closeOut.parse(raw, {
    item,
    attempt: row.attempt,
    evidence: [row],
    world: { items: new Set([item.id]), kinds: new Set(), relationTypes: new Set() },
    input: null,
  });

  expect(parsed).toStrictEqual({
    kind: 'invalid',
    problems: [{ kind: 'built-without-evidence', criteria: ['a2'] }],
  });
});

test('it returns all three problems of a close-out that has three', () => {
  const item = buildMockV1ItemView({
    acceptance: [
      { id: brandSchemas.criterionId.parse('a1'), text: 'Retries once', evidence: [] },
      { id: brandSchemas.criterionId.parse('a2'), text: 'Logs the retry', evidence: [] },
    ],
  });

  const row = buildMockEvidenceRow();
  const other = buildMockEvidenceRow();

  const raw = {
    result: { kind: 'built' },
    criteria: [
      { criterion: 'a1', evidence: other.factId },
      { criterion: 'a9', evidence: row.factId },
    ],
    openItems: [],
    friction: [],
  };

  const parsed: unknown = build.closeOut.parse(raw, {
    item,
    attempt: row.attempt,
    evidence: [row],
    world: { items: new Set([item.id]), kinds: new Set(), relationTypes: new Set() },
    input: null,
  });

  expect(parsed).toStrictEqual({
    kind: 'invalid',
    problems: [
      { kind: 'unknown-criterion', criterion: 'a9' },
      { kind: 'foreign-evidence', evidence: other.factId },
      { kind: 'built-without-evidence', criteria: ['a1', 'a2'] },
    ],
  });
});

test('it returns every schema problem of a close-out at once', () => {
  const item = buildMockV1ItemView();
  const row = buildMockEvidenceRow();

  const raw = {
    result: { kind: 'blocked' },
    criteria: [{ criterion: 'b1', evidence: row.factId }],
    openItems: [{ kind: 'core.idea', title: 'Show upload progress', body: 'Uploads look stuck' }],
    friction: [],
  };

  const parsed: unknown = build.closeOut.parse(raw, {
    item,
    attempt: row.attempt,
    evidence: [row],
    world: { items: new Set([item.id]), kinds: new Set(), relationTypes: new Set() },
    input: null,
  });

  expect(parsed).toStrictEqual({
    kind: 'invalid',
    problems: expect.toIncludeSameMembers([
      { kind: 'schema', path: 'result.reason', message: expect.any(String) },
      { kind: 'schema', path: 'criteria[0].criterion', message: expect.any(String) },
      { kind: 'schema', path: 'openItems[0].kind', message: expect.any(String) },
    ]),
  });
});

test('it rejects a friction entry whose target kind is outside the list, at its own index', () => {
  const item = buildMockV1ItemView({ acceptance: [] });
  const row = buildMockEvidenceRow();

  const raw = {
    result: { kind: 'built' },
    criteria: [],
    openItems: [],
    friction: [
      { change: 'Say where to seed faker' },
      { target: { kind: 'wiki', name: 'testing' }, change: 'Say where to seed faker' },
    ],
  };

  const parsed: unknown = build.closeOut.parse(raw, {
    item,
    attempt: row.attempt,
    evidence: [row],
    world: { items: new Set([item.id]), kinds: new Set(), relationTypes: new Set() },
    input: null,
  });

  expect(parsed).toStrictEqual({
    kind: 'invalid',
    problems: [{ kind: 'schema', path: 'friction[1].target.kind', message: expect.any(String) }],
  });
});

test('it drops each friction entry with no target and counts it in frictionDropped', () => {
  const item = buildMockV1ItemView({ acceptance: [] });
  const row = buildMockEvidenceRow();

  const raw = {
    result: { kind: 'built' },
    criteria: [],
    openItems: [],
    friction: [
      { change: 'Say where to seed faker' },
      { target: { kind: 'skill', name: 'testing' }, change: 'Say where to seed faker' },
      { target: null, change: 'Make the build faster' },
    ],
  };

  const parsed: unknown = build.closeOut.parse(raw, {
    item,
    attempt: row.attempt,
    evidence: [row],
    world: { items: new Set([item.id]), kinds: new Set(), relationTypes: new Set() },
    input: null,
  });

  expect(parsed).toStrictEqual({
    kind: 'valid',
    closeOut: {
      result: { kind: 'built' },
      criteria: [],
      openItems: [],
      friction: [{ target: { kind: 'skill', name: 'testing' }, change: 'Say where to seed faker' }],
      frictionDropped: 2,
    },
  });
});

test('it sets frictionDropped itself and ignores a count the agent sends', () => {
  const item = buildMockV1ItemView({ acceptance: [] });
  const row = buildMockEvidenceRow();

  const raw = {
    result: { kind: 'built' },
    criteria: [],
    openItems: [],
    friction: [],
    frictionDropped: 4,
  };

  const parsed: unknown = build.closeOut.parse(raw, {
    item,
    attempt: row.attempt,
    evidence: [row],
    world: { items: new Set([item.id]), kinds: new Set(), relationTypes: new Set() },
    input: null,
  });

  expect(parsed).toStrictEqual({
    kind: 'valid',
    closeOut: { ...raw, frictionDropped: 0 },
  });
});

test('it rejects a close-out that is not an object', () => {
  const item = buildMockV1ItemView();
  const row = buildMockEvidenceRow();

  const parsed: unknown = build.closeOut.parse('built', {
    item,
    attempt: row.attempt,
    evidence: [row],
    world: { items: new Set([item.id]), kinds: new Set(), relationTypes: new Set() },
    input: null,
  });

  expect(parsed).toStrictEqual({
    kind: 'invalid',
    problems: [{ kind: 'schema', path: '', message: expect.any(String) }],
  });
});

test('it rejects a close-out whose friction is not a list', () => {
  const item = buildMockV1ItemView({ acceptance: [] });
  const row = buildMockEvidenceRow();
  const raw = { result: { kind: 'built' }, criteria: [], openItems: [], friction: 'too slow' };

  const parsed: unknown = build.closeOut.parse(raw, {
    item,
    attempt: row.attempt,
    evidence: [row],
    world: { items: new Set([item.id]), kinds: new Set(), relationTypes: new Set() },
    input: null,
  });

  expect(parsed).toStrictEqual({
    kind: 'invalid',
    problems: [{ kind: 'schema', path: 'friction', message: expect.any(String) }],
  });
});

test('it rejects a close-out with a key that no build close-out has', () => {
  const item = buildMockV1ItemView({ acceptance: [] });
  const row = buildMockEvidenceRow();

  const raw = {
    result: { kind: 'built' },
    criteria: [],
    openItems: [],
    friction: [],
    learnings: 'Uploads are hard',
  };

  const parsed: unknown = build.closeOut.parse(raw, {
    item,
    attempt: row.attempt,
    evidence: [row],
    world: { items: new Set([item.id]), kinds: new Set(), relationTypes: new Set() },
    input: null,
  });

  expect(parsed).toStrictEqual({
    kind: 'invalid',
    problems: [{ kind: 'schema', path: '', message: expect.stringContaining('learnings') }],
  });
});

test('it settles a built close-out with the open items to file and the cited evidence', () => {
  const first = buildMockFactId();
  const cited = buildMockFactId();

  const item = buildMockV1ItemView({
    acceptance: [
      { id: brandSchemas.criterionId.parse('a1'), text: 'Retries once', evidence: [first] },
      { id: brandSchemas.criterionId.parse('a2'), text: 'Logs the retry', evidence: [] },
    ],
  });

  const openItem = {
    kind: 'core.issue',
    title: 'Show upload progress',
    body: 'Uploads look stuck',
  };

  const settlement: unknown = build.settle({
    attempt: buildMockV1AttemptRow(),
    item,
    closeOut: {
      result: { kind: 'built' },
      criteria: [
        { criterion: 'a1', evidence: first },
        { criterion: 'a2', evidence: cited },
      ],
      openItems: [openItem],
      friction: [],
      frictionDropped: 0,
    },
    now: brandSchemas.instant.parse(1000),
  });

  expect(settlement).toStrictEqual({
    state: 'succeeded',
    failure: null,
    outcome: 'built',
    effects: [
      { kind: 'file-item', item: openItem },
      {
        kind: 'set-acceptance',
        criteria: [
          { id: 'a1', text: 'Retries once', evidence: [first] },
          { id: 'a2', text: 'Logs the retry', evidence: [cited] },
        ],
      },
    ],
    frictionDropped: 0,
  });
});

test('it settles an abandoned close-out as failed, and leaves the acceptance list as it is', () => {
  const cited = buildMockFactId();

  const openItem = {
    kind: 'core.issue',
    title: 'Move the upload code',
    body: 'It is in two repos',
  };

  const settlement: unknown = build.settle({
    attempt: buildMockV1AttemptRow(),
    item: buildMockV1ItemView({
      acceptance: [
        { id: brandSchemas.criterionId.parse('a1'), text: 'Retries once', evidence: [] },
      ],
    }),
    closeOut: {
      result: { kind: 'abandoned', reason: 'no-capacity' },
      criteria: [{ criterion: 'a1', evidence: cited }],
      openItems: [openItem],
      friction: [],
      frictionDropped: 0,
    },
    now: brandSchemas.instant.parse(1000),
  });

  expect(settlement).toStrictEqual({
    state: 'failed',
    failure: 'abandoned',
    outcome: 'abandoned',
    effects: [{ kind: 'file-item', item: openItem }],
    frictionDropped: 0,
  });
});

test('it gives a build of round 2 the design, the send-back of the review and the pull request', () => {
  const item = buildMockV1ItemView({
    acceptance: [{ id: brandSchemas.criterionId.parse('a1'), text: 'Retries once', evidence: [] }],
  });

  const pullRequest = buildMockV1PullRequestRow();
  const head = brandSchemas.commitSha.parse('e83c5163316f89bfbde7d9ab23ca2e25604af290');

  const history = [
    buildMockV1AttemptRow({
      phase: brandSchemas.phaseName.parse('design'),
      state: 'succeeded',
      closeOut: {
        result: { kind: 'designed', design: { text: 'Retry once', location: null } },
        friction: [],
        frictionDropped: 0,
      },
    }),
    buildMockSettledAttemptRow({
      phase: 'review',
      outcome: 'changes-requested',
      endedAt: 2000,
      closeOut: {
        round: 1,
        cause: 'first',
        reading: buildMockGateReading({
          status: 'blocked',
          why: 'open-findings',
          head,
          open: { high: 1, medium: 2, low: 0 },
          answerHint: 'Reply to each open finding.',
        }),
        unrelatedLines: null,
      },
    }),
  ];

  const input = build.input({
    item,
    attempt: buildMockV1AttemptRow().id,
    history,
    retries: [],
    pullRequests: [pullRequest],
    session: null,
  });

  expect(input).toStrictEqual({
    acceptance: [{ id: 'a1', text: 'Retries once' }],
    design: { text: 'Retry once', location: null },
    sentBack: {
      from: 'review',
      head,
      open: { high: 1, medium: 2, low: 0 },
      answerHint: 'Reply to each open finding.',
    },
    pullRequest: { repo: pullRequest.repo, number: pullRequest.number, url: pullRequest.url },
  });
});

test.each([
  ['a passed review', buildMockGateReading({ status: 'passed' })],
  ['a review with a failed call', buildMockGateReading({ status: 'blocked', why: 'failed-call' })],
])('it gives a build after %s no send-back', (_title, reading) => {
  const history = [
    buildMockSettledAttemptRow({
      phase: 'review',
      outcome: 'passed',
      endedAt: 2000,
      closeOut: { round: 1, cause: 'first', reading, unrelatedLines: null },
    }),
  ];

  const input = build.input({
    item: buildMockV1ItemView({ acceptance: [] }),
    attempt: buildMockV1AttemptRow().id,
    history,
    retries: [],
    pullRequests: [],
    session: null,
  });

  expect(input).toStrictEqual({ acceptance: [], design: null, sentBack: null, pullRequest: null });
});

test('it sends a build the findings of a v1 review that asked for changes, as the store reads it', () => {
  const head = brandSchemas.commitSha.parse('e83c5163316f89bfbde7d9ab23ca2e25604af290');

  const stored = closeOutSchema.parse({
    verdict: {
      kind: 'changes-requested',
      findings: [{ title: 'The retry runs twice', body: 'Guard it.', path: 'src/upload.ts' }],
    },
    noslop: {
      version: 7,
      reviewID: 'review-3c9a',
      head,
      counts: { findings: 1, failedCalls: 0, fixChecks: 0 },
      reportBytes: 512,
      report: null,
    },
    friction: [],
    frictionDropped: 0,
  });

  const input = build.input({
    item: buildMockV1ItemView({ acceptance: [] }),
    attempt: buildMockV1AttemptRow().id,
    history: [
      buildMockSettledAttemptRow({
        phase: 'review',
        outcome: 'changes-requested',
        endedAt: 2000,
        closeOut: stored,
      }),
    ],
    retries: [],
    pullRequests: [],
    session: null,
  });

  expect(input).toStrictEqual({
    acceptance: [],
    design: null,
    sentBack: {
      from: 'review',
      head,
      open: { high: 1, medium: 0, low: 0 },
      answerHint:
        'Fix each of these findings:\n\n### The retry runs twice\nsrc/upload.ts\nGuard it.',
    },
    pullRequest: null,
  });
});
