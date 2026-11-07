import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { buildMockEvidenceRow } from '@boxxy/model/test-utils/build-mock-evidence-row';
import { buildMockItemView } from '@boxxy/model/test-utils/build-mock-item-view';
import { buildCloseOutParser } from './build-close-out-parser.ts';

test('it accepts a built close-out that cites the attempt evidence for every criterion', () => {
  const item = buildMockItemView({
    acceptance: [{ id: brandSchemas.criterionId.parse('a1'), text: 'Retries once', evidence: [] }],
  });

  const row = buildMockEvidenceRow();

  const raw = {
    result: { kind: 'built' },
    criteria: [{ criterion: 'a1', evidence: row.factId }],
    openItems: [{ kind: 'core.issue', title: 'Show upload progress', body: 'Uploads look stuck' }],
    friction: [{ target: { kind: 'lint', name: 'max-depth' }, change: 'Allow 5 in parsers' }],
  };

  const parsed: unknown = buildCloseOutParser.parse(raw, {
    item,
    attempt: row.attempt,
    evidence: [row],
  });

  expect(parsed).toStrictEqual({
    kind: 'valid',
    closeOut: { ...raw, frictionDropped: 0 },
  });
});

test('it accepts a blocked close-out that cites no evidence', () => {
  const item = buildMockItemView({
    acceptance: [{ id: brandSchemas.criterionId.parse('a1'), text: 'Retries once', evidence: [] }],
  });

  const row = buildMockEvidenceRow();

  const raw = {
    result: { kind: 'blocked', reason: 'The upload service is down' },
    criteria: [],
    openItems: [],
    friction: [],
  };

  const parsed: unknown = buildCloseOutParser.parse(raw, {
    item,
    attempt: row.attempt,
    evidence: [row],
  });

  expect(parsed).toStrictEqual({
    kind: 'valid',
    closeOut: { ...raw, frictionDropped: 0 },
  });
});

test('it rejects a close-out that fails the schema, with the path of the bad field', () => {
  const item = buildMockItemView();
  const row = buildMockEvidenceRow();
  const raw = { result: { kind: 'shipped' }, criteria: [], openItems: [], friction: [] };

  const parsed: unknown = buildCloseOutParser.parse(raw, {
    item,
    attempt: row.attempt,
    evidence: [row],
  });

  expect(parsed).toStrictEqual({
    kind: 'invalid',
    problems: [{ kind: 'schema', path: 'result.kind', message: expect.any(String) }],
  });
});

test('it rejects a close-out that cites a criterion the item lacks', () => {
  const item = buildMockItemView({
    acceptance: [{ id: brandSchemas.criterionId.parse('a1'), text: 'Retries once', evidence: [] }],
  });

  const row = buildMockEvidenceRow();

  const raw = {
    result: { kind: 'abandoned', reason: 'The item is out of date' },
    criteria: [{ criterion: 'a7', evidence: row.factId }],
    openItems: [],
    friction: [],
  };

  const parsed: unknown = buildCloseOutParser.parse(raw, {
    item,
    attempt: row.attempt,
    evidence: [row],
  });

  expect(parsed).toStrictEqual({
    kind: 'invalid',
    problems: [{ kind: 'unknown-criterion', criterion: 'a7' }],
  });
});

test('it rejects a close-out that cites evidence of another attempt', () => {
  const item = buildMockItemView({
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

  const parsed: unknown = buildCloseOutParser.parse(raw, {
    item,
    attempt: row.attempt,
    evidence: [row],
  });

  expect(parsed).toStrictEqual({
    kind: 'invalid',
    problems: [{ kind: 'foreign-evidence', evidence: other.factId }],
  });
});

test('it rejects a built close-out with a criterion that has no evidence', () => {
  const item = buildMockItemView({
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

  const parsed: unknown = buildCloseOutParser.parse(raw, {
    item,
    attempt: row.attempt,
    evidence: [row],
  });

  expect(parsed).toStrictEqual({
    kind: 'invalid',
    problems: [{ kind: 'built-without-evidence', criteria: ['a2'] }],
  });
});

test('it returns all three problems of a close-out that has three', () => {
  const item = buildMockItemView({
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

  const parsed: unknown = buildCloseOutParser.parse(raw, {
    item,
    attempt: row.attempt,
    evidence: [row],
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
  const item = buildMockItemView();
  const row = buildMockEvidenceRow();

  const raw = {
    result: { kind: 'blocked' },
    criteria: [{ criterion: 'b1', evidence: row.factId }],
    openItems: [{ kind: 'core.idea', title: 'Show upload progress', body: 'Uploads look stuck' }],
    friction: [],
  };

  const parsed: unknown = buildCloseOutParser.parse(raw, {
    item,
    attempt: row.attempt,
    evidence: [row],
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
  const item = buildMockItemView({ acceptance: [] });
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

  const parsed: unknown = buildCloseOutParser.parse(raw, {
    item,
    attempt: row.attempt,
    evidence: [row],
  });

  expect(parsed).toStrictEqual({
    kind: 'invalid',
    problems: [{ kind: 'schema', path: 'friction[1].target.kind', message: expect.any(String) }],
  });
});

test('it drops each friction entry with no target and counts it in frictionDropped', () => {
  const item = buildMockItemView({ acceptance: [] });
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

  const parsed: unknown = buildCloseOutParser.parse(raw, {
    item,
    attempt: row.attempt,
    evidence: [row],
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
  const item = buildMockItemView({ acceptance: [] });
  const row = buildMockEvidenceRow();

  const raw = {
    result: { kind: 'built' },
    criteria: [],
    openItems: [],
    friction: [],
    frictionDropped: 4,
  };

  const parsed: unknown = buildCloseOutParser.parse(raw, {
    item,
    attempt: row.attempt,
    evidence: [row],
  });

  expect(parsed).toStrictEqual({
    kind: 'valid',
    closeOut: { ...raw, frictionDropped: 0 },
  });
});

test('it rejects a close-out that is not an object', () => {
  const item = buildMockItemView();
  const row = buildMockEvidenceRow();

  const parsed: unknown = buildCloseOutParser.parse('built', {
    item,
    attempt: row.attempt,
    evidence: [row],
  });

  expect(parsed).toStrictEqual({
    kind: 'invalid',
    problems: [{ kind: 'schema', path: '', message: expect.any(String) }],
  });
});

test('it rejects a close-out whose friction is not a list', () => {
  const item = buildMockItemView({ acceptance: [] });
  const row = buildMockEvidenceRow();
  const raw = { result: { kind: 'built' }, criteria: [], openItems: [], friction: 'too slow' };

  const parsed: unknown = buildCloseOutParser.parse(raw, {
    item,
    attempt: row.attempt,
    evidence: [row],
  });

  expect(parsed).toStrictEqual({
    kind: 'invalid',
    problems: [{ kind: 'schema', path: 'friction', message: expect.any(String) }],
  });
});
