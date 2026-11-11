import { brandSchemas } from '../rows/brand-schemas.ts';
import { definePhase } from '../rules/define-phase.ts';
import type { PhaseKind } from '../rules/types.ts';

interface MockPhaseKindInput {
  readonly name: string;
  readonly outcomes: readonly string[];
}

// A phase kind with only a name and an outcome list: its close-out is any value, and it settles
// with its first outcome.
export function buildMockPhaseKind(input: MockPhaseKindInput): PhaseKind {
  return definePhase({
    name: brandSchemas.phaseName.parse(input.name),
    version: 1,
    worker: brandSchemas.workerKindName.parse('atc.session'),
    outcomes: input.outcomes,
    needsAcceptance: false,
    input: () => ({}),
    closeOut: { parse: (raw) => ({ kind: 'valid', closeOut: raw }) },
    settle: () => ({
      state: 'succeeded',
      failure: null,
      outcome: input.outcomes[0] ?? '',
      effects: [],
      frictionDropped: 0,
    }),
  });
}
