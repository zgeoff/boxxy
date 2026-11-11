import type { Settled } from '../pipeline/types.ts';
import { brandSchemas } from '../rows/brand-schemas.ts';

interface MockSettledInput {
  readonly phase: string;
  readonly outcome: string;
  readonly endedAt: number;
  readonly failure?: string | null;
}

export function buildMockSettled(input: MockSettledInput): Settled {
  return {
    phase: brandSchemas.phaseName.parse(input.phase),
    outcome: input.outcome,
    endedAt: brandSchemas.instant.parse(input.endedAt),
    failure: input.failure ?? null,
  };
}
