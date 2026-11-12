import { brandSchemas } from '../rows/brand-schemas.ts';
import type { AttemptRow } from '../types.ts';
import { buildMockV1AttemptRow } from './build-mock-v1-attempt-row.ts';

interface MockSettledAttemptRowInput {
  readonly phase: string;
  readonly outcome: string;
  readonly endedAt: number;
  readonly state?: 'succeeded' | 'failed';
  readonly closeOut?: AttemptRow['closeOut'];
}

// An attempt row that settled with the outcome at `endedAt`, succeeded unless the test says not.
export function buildMockSettledAttemptRow(input: MockSettledAttemptRowInput): AttemptRow {
  return buildMockV1AttemptRow({
    phase: brandSchemas.phaseName.parse(input.phase),
    state: input.state ?? 'succeeded',
    outcome: brandSchemas.outcomeName.parse(input.outcome),
    endedAt: brandSchemas.instant.parse(input.endedAt),
    closeOut: input.closeOut ?? null,
  });
}
