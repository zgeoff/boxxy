import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { buildMockV1AttemptRow } from '@boxxy/model/test-utils/build-mock-v1-attempt-row';
import { buildMockV1ItemView } from '@boxxy/model/test-utils/build-mock-v1-item-view';
import { design } from './design.ts';

test('it accepts a designed close-out with the summary and the place of the design', () => {
  const item = buildMockV1ItemView();

  const raw = {
    result: {
      kind: 'designed',
      design: { summary: 'Retry once from the upload queue', location: 'docs/design/upload.md' },
    },
    friction: [{ target: { kind: 'skill', name: 'bake-off' }, change: 'Name the judge' }],
  };

  const parsed: unknown = design.closeOut.parse(raw, {
    item,
    attempt: buildMockV1AttemptRow().id,
    evidence: [],
    world: { items: new Set([item.id]), kinds: new Set(), relationTypes: new Set() },
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
    world: { items: new Set([item.id]), kinds: new Set(), relationTypes: new Set() },
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
      result: { kind: 'designed', design: { summary: 'Retry once', location: null } },
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
