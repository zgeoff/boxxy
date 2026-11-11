import { expect, test } from 'bun:test';
import { brandSchemas } from '../rows/brand-schemas.ts';
import { buildMockPhaseKind } from './build-mock-phase-kind.ts';
import { buildMockV1AttemptRow } from './build-mock-v1-attempt-row.ts';
import { buildMockV1ItemView } from './build-mock-v1-item-view.ts';

test('it builds a phase kind with the name and outcomes it is given', () => {
  const phase = buildMockPhaseKind({ name: 'build', outcomes: ['built', 'blocked'] });

  expect({ name: phase.name, outcomes: phase.outcomes }).toStrictEqual({
    name: brandSchemas.phaseName.parse('build'),
    outcomes: ['built', 'blocked'],
  });
});

test('it settles with the first outcome', () => {
  const phase = buildMockPhaseKind({ name: 'build', outcomes: ['built', 'blocked'] });

  const settlement = phase.settle({
    attempt: buildMockV1AttemptRow(),
    item: buildMockV1ItemView(),
    closeOut: {},
    now: brandSchemas.instant.parse(1000),
  });

  expect(settlement).toStrictEqual({
    state: 'succeeded',
    failure: null,
    outcome: 'built',
    effects: [],
    frictionDropped: 0,
  });
});
