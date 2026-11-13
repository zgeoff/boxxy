import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import type { TriageCloseOut } from '@boxxy/model';
import { buildMockSettledAttemptRow } from '@boxxy/model/test-utils/build-mock-settled-attempt-row';
import { buildMockV1AttemptRow } from '@boxxy/model/test-utils/build-mock-v1-attempt-row';
import { buildMockV1ItemView } from '@boxxy/model/test-utils/build-mock-v1-item-view';
import { triage } from './triage.ts';

test('it accepts an accepted close-out that sets the kind, the design mode and the acceptance list', () => {
  const item = buildMockV1ItemView({ acceptance: [] });
  const other = brandSchemas.itemId.parse('0192f0c5-3c4d-7e5f-a061-7b8c9d0e1f2a');

  const raw = {
    result: { kind: 'accepted' },
    set: {
      kind: 'core.issue',
      designMode: 'attended',
      acceptance: [{ text: 'A failed upload retries once' }],
    },
    relations: [{ type: 'relates-to', target: other }],
    friction: [],
  };

  const parsed: unknown = triage.closeOut.parse(raw, {
    item,
    attempt: buildMockV1AttemptRow().id,
    evidence: [],
    world: {
      items: new Set([item.id, other]),
      kinds: new Set([brandSchemas.itemKindName.parse('core.issue')]),
      relationTypes: new Set([brandSchemas.relationTypeName.parse('relates-to')]),
    },
    input: null,
  });

  expect(parsed).toStrictEqual({ kind: 'valid', closeOut: { ...raw, frictionDropped: 0 } });
});

test('it returns both problems of a close-out with an unknown kind and an unknown relation type', () => {
  const item = buildMockV1ItemView();
  const other = brandSchemas.itemId.parse('0192f0c5-3c4d-7e5f-a061-7b8c9d0e1f2a');

  const raw = {
    result: { kind: 'accepted' },
    set: { kind: 'core.task' },
    relations: [{ type: 'follows', target: other }],
    friction: [],
  };

  const parsed: unknown = triage.closeOut.parse(raw, {
    item,
    attempt: buildMockV1AttemptRow().id,
    evidence: [],
    world: {
      items: new Set([item.id, other]),
      kinds: new Set([brandSchemas.itemKindName.parse('core.issue')]),
      relationTypes: new Set([brandSchemas.relationTypeName.parse('relates-to')]),
    },
    input: null,
  });

  expect(parsed).toStrictEqual({
    kind: 'invalid',
    problems: [
      { kind: 'unknown-kind', itemKind: 'core.task' },
      { kind: 'refused-relation', type: 'follows', target: other, reason: 'unknown-type' },
    ],
  });
});

test('it refuses to accept an item that has no acceptance list and gets none', () => {
  const item = buildMockV1ItemView({ acceptance: [] });
  const raw = { result: { kind: 'accepted' }, relations: [], friction: [] };

  const parsed: unknown = triage.closeOut.parse(raw, {
    item,
    attempt: buildMockV1AttemptRow().id,
    evidence: [],
    world: { items: new Set([item.id]), kinds: new Set(), relationTypes: new Set() },
    input: null,
  });

  expect(parsed).toStrictEqual({ kind: 'invalid', problems: [{ kind: 'no-acceptance' }] });
});

test('it refuses to accept an item with an empty acceptance list in place of its own', () => {
  const item = buildMockV1ItemView();

  const raw = {
    result: { kind: 'accepted' },
    set: { acceptance: [] },
    relations: [],
    friction: [],
  };

  const parsed: unknown = triage.closeOut.parse(raw, {
    item,
    attempt: buildMockV1AttemptRow().id,
    evidence: [],
    world: { items: new Set([item.id]), kinds: new Set(), relationTypes: new Set() },
    input: null,
  });

  expect(parsed).toStrictEqual({ kind: 'invalid', problems: [{ kind: 'no-acceptance' }] });
});

test('it refuses a duplicate of an item the store does not have, and of the item itself', () => {
  const item = buildMockV1ItemView();
  const missing = brandSchemas.itemId.parse('0192f0c5-3c4d-7e5f-a061-7b8c9d0e1f2a');

  const raw = {
    result: { kind: 'duplicate', of: missing },
    relations: [{ type: 'relates-to', target: item.id }],
    friction: [],
  };

  const parsed: unknown = triage.closeOut.parse(raw, {
    item,
    attempt: buildMockV1AttemptRow().id,
    evidence: [],
    world: {
      items: new Set([item.id]),
      kinds: new Set(),
      relationTypes: new Set([brandSchemas.relationTypeName.parse('relates-to')]),
    },
    input: null,
  });

  expect(parsed).toStrictEqual({
    kind: 'invalid',
    problems: [
      { kind: 'unknown-item', item: missing },
      { kind: 'refused-relation', type: 'relates-to', target: item.id, reason: 'self' },
    ],
  });
});

test('it rejects a relation from an unknown item, and one from the item itself', () => {
  const item = buildMockV1ItemView();
  const missing = brandSchemas.itemId.parse('0192f0c5-3c4d-7e5f-a061-7b8c9d0e1f2a');

  const raw = {
    result: { kind: 'accepted' },
    relations: [
      { type: 'blocks', source: missing },
      { type: 'blocks', source: item.id },
    ],
    friction: [],
  };

  const parsed: unknown = triage.closeOut.parse(raw, {
    item,
    attempt: buildMockV1AttemptRow().id,
    evidence: [],
    world: {
      items: new Set([item.id]),
      kinds: new Set(),
      relationTypes: new Set([brandSchemas.relationTypeName.parse('blocks')]),
    },
    input: null,
  });

  expect(parsed).toStrictEqual({
    kind: 'invalid',
    problems: [
      { kind: 'unknown-item', item: missing },
      { kind: 'refused-relation', type: 'blocks', target: item.id, reason: 'self' },
    ],
  });
});

test('it accepts a relation from another item and one to it, and refuses only a repeat', () => {
  const item = buildMockV1ItemView();
  const other = brandSchemas.itemId.parse('0192f0c5-3c4d-7e5f-a061-7b8c9d0e1f2a');

  const raw = {
    result: { kind: 'accepted' },
    relations: [
      { type: 'blocks', source: other },
      { type: 'blocks', target: other },
      { type: 'blocks', source: other },
    ],
    friction: [],
  };

  const parsed: unknown = triage.closeOut.parse(raw, {
    item,
    attempt: buildMockV1AttemptRow().id,
    evidence: [],
    world: {
      items: new Set([item.id, other]),
      kinds: new Set(),
      relationTypes: new Set([brandSchemas.relationTypeName.parse('blocks')]),
    },
    input: null,
  });

  expect(parsed).toStrictEqual({
    kind: 'invalid',
    problems: [
      { kind: 'phase-rule', message: `the close-out names blocks from ${other} more than once` },
    ],
  });
});

test('it rejects a split whose part is of a kind the rules lack', () => {
  const item = buildMockV1ItemView();

  const raw = {
    result: { kind: 'split', openItems: [{ kind: 'core.epic', title: 'Export as CSV', body: '' }] },
    relations: [],
    friction: [],
  };

  const parsed: unknown = triage.closeOut.parse(raw, {
    item,
    attempt: buildMockV1AttemptRow().id,
    evidence: [],
    world: {
      items: new Set([item.id]),
      kinds: new Set([brandSchemas.itemKindName.parse('core.issue')]),
      relationTypes: new Set(),
    },
    input: null,
  });

  expect(parsed).toStrictEqual({
    kind: 'invalid',
    problems: [{ kind: 'unknown-kind', itemKind: 'core.epic' }],
  });
});

test('it refuses each repeat of a relation, the duplicate-of relation of a duplicate among them', () => {
  const item = buildMockV1ItemView();
  const other = brandSchemas.itemId.parse('0192f0c5-3c4d-7e5f-a061-7b8c9d0e1f2a');

  const raw = {
    result: { kind: 'duplicate', of: other },
    relations: [
      { type: 'relates-to', target: other },
      { type: 'relates-to', target: other },
      { type: 'duplicate-of', target: other },
    ],
    friction: [],
  };

  const parsed: unknown = triage.closeOut.parse(raw, {
    item,
    attempt: buildMockV1AttemptRow().id,
    evidence: [],
    world: {
      items: new Set([item.id, other]),
      kinds: new Set(),
      relationTypes: new Set(
        ['relates-to', 'duplicate-of'].map((type) => brandSchemas.relationTypeName.parse(type)),
      ),
    },
    input: null,
  });

  expect(parsed).toStrictEqual({
    kind: 'invalid',
    problems: [
      { kind: 'phase-rule', message: `the close-out names relates-to ${other} more than once` },
      { kind: 'phase-rule', message: `the close-out names duplicate-of ${other} more than once` },
    ],
  });
});

test('it settles an accepted close-out with an effect for each change it asks for', () => {
  const item = buildMockV1ItemView({ acceptance: [] });
  const other = brandSchemas.itemId.parse('0192f0c5-3c4d-7e5f-a061-7b8c9d0e1f2a');
  const friction = { target: { kind: 'skill', name: 'triage' }, change: 'Say how to size' };

  const settlement: unknown = triage.settle({
    attempt: buildMockV1AttemptRow({ phase: brandSchemas.phaseName.parse('triage') }),
    item,
    closeOut: {
      result: { kind: 'accepted' },
      set: {
        kind: 'core.idea',
        designMode: 'agent',
        acceptance: [{ text: 'A failed upload retries once' }, { text: 'The retry is logged' }],
        body: '## Scope\n\nThe upload row only.',
      },
      relations: [{ type: 'blocks', target: other }],
      friction: [friction],
      frictionDropped: 1,
    },
    now: brandSchemas.instant.parse(1000),
  });

  expect(settlement).toStrictEqual({
    state: 'succeeded',
    failure: null,
    outcome: 'accepted',
    effects: [
      { kind: 'set-kind', itemKind: 'core.idea' },
      { kind: 'set-field', field: 'designMode', value: 'agent' },
      {
        kind: 'set-acceptance',
        criteria: [
          { id: 'a1', text: 'A failed upload retries once', evidence: [] },
          { id: 'a2', text: 'The retry is logged', evidence: [] },
        ],
      },
      { kind: 'set-body', body: '## Scope\n\nThe upload row only.' },
      { kind: 'add-relation', relation: { type: 'blocks', target: other } },
      { kind: 'record-proposal', friction },
    ],
    frictionDropped: 1,
  });
});

test('it settles a duplicate with the close of the item as a duplicate of the other', () => {
  const other = brandSchemas.itemId.parse('0192f0c5-3c4d-7e5f-a061-7b8c9d0e1f2a');

  const settlement: unknown = triage.settle({
    attempt: buildMockV1AttemptRow({ phase: brandSchemas.phaseName.parse('triage') }),
    item: buildMockV1ItemView(),
    closeOut: {
      result: { kind: 'duplicate', of: other },
      relations: [],
      friction: [],
      frictionDropped: 0,
    },
    now: brandSchemas.instant.parse(1000),
  });

  expect(settlement).toStrictEqual({
    state: 'succeeded',
    failure: null,
    outcome: 'duplicate',
    effects: [{ kind: 'close-item', reason: 'duplicate', of: other }],
    frictionDropped: 0,
  });
});

test('it settles a declined close-out with the close of the item for its reason', () => {
  const settlement: unknown = triage.settle({
    attempt: buildMockV1AttemptRow({ phase: brandSchemas.phaseName.parse('triage') }),
    item: buildMockV1ItemView(),
    closeOut: {
      result: { kind: 'declined', reason: 'The upload page is being removed' },
      relations: [],
      friction: [],
      frictionDropped: 0,
    },
    now: brandSchemas.instant.parse(1000),
  });

  expect(settlement).toStrictEqual({
    state: 'succeeded',
    failure: null,
    outcome: 'declined',
    effects: [{ kind: 'close-item', reason: 'The upload page is being removed', of: null }],
    frictionDropped: 0,
  });
});

test('it settles a needs-owner close-out with no close of the item', () => {
  const settlement: unknown = triage.settle({
    attempt: buildMockV1AttemptRow({ phase: brandSchemas.phaseName.parse('triage') }),
    item: buildMockV1ItemView(),
    closeOut: {
      result: { kind: 'needs-owner', question: 'Should the export cover archived projects?' },
      relations: [],
      friction: [],
      frictionDropped: 0,
    },
    now: brandSchemas.instant.parse(1000),
  });

  expect(settlement).toStrictEqual({
    state: 'succeeded',
    failure: null,
    outcome: 'needs-owner',
    effects: [],
    frictionDropped: 0,
  });
});

test('it settles a split close-out with the filing of each part and the close of the item', () => {
  const parts = [
    { kind: 'core.issue' as const, title: 'Export projects as CSV', body: 'One part.' },
    { kind: 'core.issue' as const, title: 'Export projects as JSON', body: 'The other part.' },
  ];

  const settlement: unknown = triage.settle({
    attempt: buildMockV1AttemptRow({ phase: brandSchemas.phaseName.parse('triage') }),
    item: buildMockV1ItemView(),
    closeOut: {
      result: { kind: 'split', openItems: parts },
      relations: [],
      friction: [],
      frictionDropped: 0,
    },
    now: brandSchemas.instant.parse(1000),
  });

  expect(settlement).toStrictEqual({
    state: 'succeeded',
    failure: null,
    outcome: 'split',
    effects: [
      { kind: 'file-item', item: parts[0] },
      { kind: 'file-item', item: parts[1] },
      { kind: 'close-item', reason: 'split', of: null },
    ],
    frictionDropped: 0,
  });
});

test('it gives a triage attempt the item acceptance list as its input', () => {
  const item = buildMockV1ItemView({
    acceptance: [
      {
        id: brandSchemas.criterionId.parse('a1'),
        text: 'A failed upload retries once',
        evidence: [],
      },
    ],
  });

  const attempt = buildMockV1AttemptRow().id;

  expect(
    triage.input({ item, attempt, history: [], retries: [], pullRequests: [], session: null }),
  ).toStrictEqual({
    acceptance: [{ id: 'a1', text: 'A failed upload retries once' }],
    stopped: null,
  });
});

test.each<[string, (TriageCloseOut['result'] | null)[], string | null]>([
  [
    'a latest triage that closed out needs-owner',
    [{ kind: 'needs-owner', question: 'Is the old upload page in scope?' }],
    'Is the old upload page in scope?',
  ],
  [
    'a needs-owner triage and then one that ended with no close-out',
    [{ kind: 'needs-owner', question: 'Is the old upload page in scope?' }, null],
    'Is the old upload page in scope?',
  ],
  [
    'a needs-owner triage and then an accepted one',
    [{ kind: 'needs-owner', question: 'Is the old upload page in scope?' }, { kind: 'accepted' }],
    null,
  ],
])('it carries the owner question, or none, into a triage after %s', (_title, results, stopped) => {
  const history = results.map((result, index) =>
    buildMockSettledAttemptRow({
      phase: 'triage',
      outcome: result?.kind ?? 'timed-out',
      state: result === null ? 'failed' : 'succeeded',
      endedAt: 1000 * (index + 1),
      closeOut:
        result === null ? null : { result, relations: [], friction: [], frictionDropped: 0 },
    }),
  );

  const input = triage.input({
    item: buildMockV1ItemView({ acceptance: [] }),
    attempt: buildMockV1AttemptRow().id,
    history,
    retries: [],
    pullRequests: [],
    session: null,
  });

  expect(input).toStrictEqual({ acceptance: [], stopped });
});
