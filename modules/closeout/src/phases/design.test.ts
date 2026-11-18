import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import type { DesignCloseOut } from '@boxxy/model';
import { buildMockSettledAttemptRow } from '@boxxy/model/test-utils/build-mock-settled-attempt-row';
import { buildMockV1AttemptRow } from '@boxxy/model/test-utils/build-mock-v1-attempt-row';
import { buildMockV1ItemView } from '@boxxy/model/test-utils/build-mock-v1-item-view';
import { design } from './design.ts';

test('it accepts a designed close-out with the design text and the place of the design', () => {
  const item = buildMockV1ItemView();

  const raw = {
    result: {
      kind: 'designed',
      design: { text: 'Retry once from the upload queue', location: 'docs/design/upload.md' },
    },
    friction: [{ target: { kind: 'skill', name: 'bake-off' }, change: 'Name the judge' }],
  };

  const parsed: unknown = design.closeOut.parse(raw, {
    item,
    attempt: buildMockV1AttemptRow().id,
    evidence: [],
    world: {
      items: new Set([item.id]),
      kinds: new Set(),
      relationTypes: new Set(),
      criterionTags: new Set(),
    },
    input: null,
  });

  expect(parsed).toStrictEqual({ kind: 'valid', closeOut: { ...raw, frictionDropped: 0 } });
});

test('it returns both problems of a blocked close-out with no reason and a bad friction target', () => {
  const item = buildMockV1ItemView();

  const raw = {
    result: { kind: 'blocked' },
    friction: [{ target: { kind: 'wiki', name: 'design' }, change: 'Link the old design' }],
  };

  const parsed: unknown = design.closeOut.parse(raw, {
    item,
    attempt: buildMockV1AttemptRow().id,
    evidence: [],
    world: {
      items: new Set([item.id]),
      kinds: new Set(),
      relationTypes: new Set(),
      criterionTags: new Set(),
    },
    input: null,
  });

  expect(parsed).toStrictEqual({
    kind: 'invalid',
    problems: expect.toIncludeSameMembers([
      { kind: 'schema', path: 'result.reason', message: expect.any(String) },
      { kind: 'schema', path: 'friction[0].target.kind', message: expect.any(String) },
    ]),
  });
});

test('it settles a designed close-out as succeeded, with a proposal for each friction entry', () => {
  const friction = { target: { kind: 'skill', name: 'bake-off' }, change: 'Name the judge' };

  const settlement: unknown = design.settle({
    attempt: buildMockV1AttemptRow({ phase: brandSchemas.phaseName.parse('design') }),
    item: buildMockV1ItemView(),
    closeOut: {
      result: { kind: 'designed', design: { text: 'Retry once', location: null } },
      friction: [friction],
      frictionDropped: 0,
    },
    now: brandSchemas.instant.parse(1000),
  });

  expect(settlement).toStrictEqual({
    state: 'succeeded',
    failure: null,
    outcome: 'designed',
    effects: [{ kind: 'record-proposal', friction }],
    frictionDropped: 0,
  });
});

test('it settles a designed close-out with an effect to file each open item and to set the acceptance list', () => {
  const openItem = { kind: 'core.issue' as const, title: 'Cap the retry queue', body: 'Found.' };

  const settlement: unknown = design.settle({
    attempt: buildMockV1AttemptRow({ phase: brandSchemas.phaseName.parse('design') }),
    item: buildMockV1ItemView(),
    closeOut: {
      result: {
        kind: 'designed',
        design: { text: 'Retry once', location: null },
        set: { acceptance: [{ text: 'A failed upload retries once' }, { text: 'It is logged' }] },
        openItems: [openItem],
      },
      friction: [],
      frictionDropped: 0,
    },
    now: brandSchemas.instant.parse(1000),
  });

  expect(settlement).toStrictEqual({
    state: 'succeeded',
    failure: null,
    outcome: 'designed',
    effects: [
      { kind: 'file-item', item: openItem, key: '#0' },
      {
        kind: 'set-acceptance',
        criteria: [
          { id: 'a1', text: 'A failed upload retries once', evidence: [] },
          { id: 'a2', text: 'It is logged', evidence: [] },
        ],
      },
    ],
    frictionDropped: 0,
  });
});

test('it settles open items that block each other with one link per pair after the filings', () => {
  const settlement = design.settle({
    attempt: buildMockV1AttemptRow({ phase: brandSchemas.phaseName.parse('design') }),
    item: buildMockV1ItemView(),
    closeOut: {
      result: {
        kind: 'designed',
        design: { text: 'Scaffold first', location: null },
        openItems: [
          {
            kind: brandSchemas.itemKindName.parse('core.issue'),
            title: 'Scaffold the repo',
            body: 'Found.',
            key: 'scaffold',
            blocks: ['item', 'alerts'],
          },
          {
            kind: brandSchemas.itemKindName.parse('core.issue'),
            title: 'Send the alerts',
            body: 'Found.',
            key: 'alerts',
            blockedBy: ['scaffold'],
          },
        ],
      },
      friction: [],
      frictionDropped: 0,
    },
    now: brandSchemas.instant.parse(1000),
  });

  const received: unknown = settlement.effects;

  expect(received).toStrictEqual([
    {
      kind: 'file-item',
      item: { kind: 'core.issue', title: 'Scaffold the repo', body: 'Found.' },
      key: 'scaffold',
    },
    {
      kind: 'file-item',
      item: { kind: 'core.issue', title: 'Send the alerts', body: 'Found.' },
      key: 'alerts',
    },
    {
      kind: 'add-relation',
      link: {
        type: 'blocks',
        from: { kind: 'open-item', key: 'scaffold' },
        to: { kind: 'item' },
      },
    },
    {
      kind: 'add-relation',
      link: {
        type: 'blocks',
        from: { kind: 'open-item', key: 'scaffold' },
        to: { kind: 'open-item', key: 'alerts' },
      },
    },
  ]);
});

test('it returns the problems of open item links that name an unknown key, a repeated key and the item itself', () => {
  const item = buildMockV1ItemView();

  const raw = {
    result: {
      kind: 'designed',
      design: { text: 'Scaffold first', location: null },
      openItems: [
        { kind: 'core.issue', title: 'One', body: 'Found.', key: 'one', blocks: ['two', 'one'] },
        { kind: 'core.issue', title: 'Again', body: 'Found.', key: 'one' },
      ],
    },
    friction: [],
  };

  const parsed: unknown = design.closeOut.parse(raw, {
    item,
    attempt: buildMockV1AttemptRow().id,
    evidence: [],
    world: {
      items: new Set([item.id]),
      kinds: new Set([brandSchemas.itemKindName.parse('core.issue')]),
      relationTypes: new Set([brandSchemas.relationTypeName.parse('blocks')]),
      criterionTags: new Set(),
    },
    input: null,
  });

  expect(parsed).toStrictEqual({
    kind: 'invalid',
    problems: [
      { kind: 'phase-rule', message: 'the close-out gives more than one open item the key one' },
      {
        kind: 'phase-rule',
        message: 'an open item names two, which is neither `item` nor the key of an open item',
      },
      { kind: 'phase-rule', message: 'the open item one names itself' },
    ],
  });
});

test('it returns the relation problems of a blocked close-out', () => {
  const item = buildMockV1ItemView();
  const unknown = buildMockV1ItemView().id;

  const raw = {
    result: {
      kind: 'blocked',
      reason: 'The settings page must land first.',
      relations: [
        { type: 'blocks', source: unknown },
        { type: 'waits-for', source: item.id },
      ],
    },
    friction: [],
  };

  const parsed: unknown = design.closeOut.parse(raw, {
    item,
    attempt: buildMockV1AttemptRow().id,
    evidence: [],
    world: {
      items: new Set([item.id]),
      kinds: new Set(),
      relationTypes: new Set([brandSchemas.relationTypeName.parse('blocks')]),
      criterionTags: new Set(),
    },
    input: null,
  });

  expect(parsed).toStrictEqual({
    kind: 'invalid',
    problems: expect.toIncludeSameMembers([
      { kind: 'unknown-item', item: unknown },
      { kind: 'refused-relation', type: 'waits-for', target: item.id, reason: 'unknown-type' },
      { kind: 'refused-relation', type: 'waits-for', target: item.id, reason: 'self' },
    ]),
  });
});

test('it refuses relations with an abandoned design', () => {
  const item = buildMockV1ItemView();

  const raw = {
    result: {
      kind: 'abandoned',
      reason: 'The theme is out of scope.',
      relations: [{ type: 'blocks', source: item.id }],
    },
    friction: [],
  };

  const parsed: unknown = design.closeOut.parse(raw, {
    item,
    attempt: buildMockV1AttemptRow().id,
    evidence: [],
    world: {
      items: new Set([item.id]),
      kinds: new Set(),
      relationTypes: new Set(),
      criterionTags: new Set(),
    },
    input: null,
  });

  expect(parsed).toStrictEqual({
    kind: 'invalid',
    problems: [{ kind: 'schema', path: 'result', message: expect.any(String) }],
  });
});

test.each([
  ['blocked', { kind: 'blocked' as const, reason: 'The settings page must land first.' }],
  ['designed', { kind: 'designed' as const, design: { text: 'Retry once', location: null } }],
])('it settles a %s close-out with an effect to add each relation', (_name, result) => {
  const relation = {
    type: brandSchemas.relationTypeName.parse('blocks'),
    source: buildMockV1ItemView().id,
  };

  const settlement = design.settle({
    attempt: buildMockV1AttemptRow({ phase: brandSchemas.phaseName.parse('design') }),
    item: buildMockV1ItemView(),
    closeOut: { result: { ...result, relations: [relation] }, friction: [], frictionDropped: 0 },
    now: brandSchemas.instant.parse(1000),
  });

  const effects: unknown = settlement.effects;

  expect(effects).toStrictEqual([{ kind: 'add-relation', relation }]);
});

test('it settles a blocked close-out as failed, with the outcome name as the failure', () => {
  const settlement: unknown = design.settle({
    attempt: buildMockV1AttemptRow({ phase: brandSchemas.phaseName.parse('design') }),
    item: buildMockV1ItemView(),
    closeOut: {
      result: { kind: 'blocked', reason: 'Should a retry keep the old upload id?' },
      friction: [],
      frictionDropped: 0,
    },
    now: brandSchemas.instant.parse(1000),
  });

  expect(settlement).toStrictEqual({
    state: 'failed',
    failure: 'blocked',
    outcome: 'blocked',
    effects: [],
    frictionDropped: 0,
  });
});

test.each([
  ['attended', { designMode: 'attended' as const }],
  ['agent', { designMode: 'agent' as const }],
  ['agent', {}],
])('it runs the design in %s mode for an item with the fields %o', (mode, fields) => {
  const picked: unknown = design.mode?.(buildMockV1ItemView({ fields }));

  expect(picked).toBe(mode);
});

test.each<[string, (DesignCloseOut['result'] | null)[], string | null]>([
  ['no earlier design', [], null],
  [
    'a latest design that closed out blocked',
    [{ kind: 'blocked', reason: 'Light or dark by default? The toggle is settled.' }],
    'Light or dark by default? The toggle is settled.',
  ],
  [
    'a blocked design and then one that ended with no close-out',
    [{ kind: 'blocked', reason: 'Light or dark by default?' }, null],
    'Light or dark by default?',
  ],
  [
    'a blocked design and then an abandoned one',
    [
      { kind: 'blocked', reason: 'Light or dark by default?' },
      { kind: 'abandoned', reason: 'The theme moved to another item.' },
    ],
    null,
  ],
  [
    'a blocked design and then a designed one',
    [
      { kind: 'blocked', reason: 'Light or dark by default?' },
      { kind: 'designed', design: { text: 'Dark by default.', location: null } },
    ],
    null,
  ],
])('it carries the blocked reason, or none, into a design after %s', (_title, results, stopped) => {
  const history = results.map((result, index) =>
    buildMockSettledAttemptRow({
      phase: 'design',
      state: result?.kind === 'designed' ? 'succeeded' : 'failed',
      outcome: result?.kind ?? 'timed-out',
      endedAt: 1000 * (index + 1),
      closeOut: result === null ? null : { result, friction: [], frictionDropped: 0 },
    }),
  );

  const input = design.input({
    item: buildMockV1ItemView({ acceptance: [] }),
    attempt: buildMockV1AttemptRow().id,
    history,
    retries: [],
    pullRequests: [],
    shipped: [],
    session: null,
  });

  expect(input).toStrictEqual({ acceptance: [], stopped });
});

test('it gives the agent a close-out schema that names the design text', () => {
  expect(JSON.stringify(design.closeOut.jsonSchema)).toContain('"text"');
  expect(JSON.stringify(design.closeOut.jsonSchema)).not.toContain('"summary"');
});

test('it refuses a design close-out whose acceptance list holds a tag the rules file does not list', () => {
  const item = buildMockV1ItemView();

  const raw = {
    result: {
      kind: 'designed',
      design: { text: 'Retry once', location: null },
      set: { acceptance: [{ text: 'The page loads', tags: ['smoke'] }] },
    },
    friction: [],
  };

  const parsed: unknown = design.closeOut.parse(raw, {
    item,
    attempt: buildMockV1AttemptRow().id,
    evidence: [],
    world: {
      items: new Set([item.id]),
      kinds: new Set(),
      relationTypes: new Set(),
      criterionTags: new Set(['prod']),
    },
    input: null,
  });

  expect(parsed).toStrictEqual({
    kind: 'invalid',
    problems: [{ kind: 'unknown-criterion-tag', tag: 'smoke' }],
  });
});

test('it gives the design input the tags of each acceptance line', () => {
  const item = buildMockV1ItemView({
    acceptance: [
      {
        id: brandSchemas.criterionId.parse('a1'),
        text: 'The page loads',
        evidence: [],
        tags: ['prod'],
      },
    ],
  });

  const input: unknown = design.input({
    item,
    attempt: buildMockV1AttemptRow().id,
    history: [],
    retries: [],
    pullRequests: [],
    shipped: [],
    session: null,
  });

  expect(input).toMatchObject({
    acceptance: [{ id: 'a1', text: 'The page loads', tags: ['prod'] }],
  });
});
