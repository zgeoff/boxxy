import type { Settled } from '../pipeline/types.ts';
import { brandSchemas } from '../rows/brand-schemas.ts';

interface MockSettledInput {
  readonly phase: string;
  readonly outcome: string;
  readonly endedAt: number;
  readonly failure?: string | null;
  readonly pullRequest?: { readonly repo: string; readonly number: number } | null;
}

export function buildMockSettled(input: MockSettledInput): Settled {
  return {
    phase: brandSchemas.phaseName.parse(input.phase),
    outcome: input.outcome,
    endedAt: brandSchemas.instant.parse(input.endedAt),
    failure: input.failure ?? null,
    ...(input.pullRequest === undefined
      ? {}
      : {
          pullRequest:
            input.pullRequest === null
              ? null
              : {
                  repo: brandSchemas.repoName.parse(input.pullRequest.repo),
                  number: input.pullRequest.number,
                },
        }),
  };
}
