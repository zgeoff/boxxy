import { expect, test } from 'bun:test';
import { brandSchemas } from '../rows/brand-schemas.ts';
import { buildMockV1AttemptRow } from '../test-utils/build-mock-v1-attempt-row.ts';
import { buildMockV1ItemView } from '../test-utils/build-mock-v1-item-view.ts';
import { definePhase } from './define-phase.ts';
import type { PhaseKind } from './types.ts';

test('it gives the registry a phase kind that settles the close-out it is given', () => {
  const phase: PhaseKind = definePhase({
    name: brandSchemas.phaseName.parse('check'),
    version: 1,
    worker: brandSchemas.workerKindName.parse('atc.session'),
    outcomes: ['passed', 'failed'],
    needsAcceptance: false,
    input: (ctx) => ({ title: ctx.item.title }),
    closeOut: { parse: (raw) => ({ kind: 'valid', closeOut: { passed: raw === true } }) },
    settle: (input) => ({
      state: input.closeOut.passed ? 'succeeded' : 'failed',
      failure: input.closeOut.passed ? null : 'the check failed',
      outcome: input.closeOut.passed ? 'passed' : 'failed',
      effects: [],
      frictionDropped: 0,
    }),
  });

  const settlement = phase.settle({
    attempt: buildMockV1AttemptRow(),
    item: buildMockV1ItemView(),
    closeOut: { passed: false },
    now: brandSchemas.instant.parse(1000),
  });

  expect(settlement).toStrictEqual({
    state: 'failed',
    failure: 'the check failed',
    outcome: 'failed',
    effects: [],
    frictionDropped: 0,
  });
});
