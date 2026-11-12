import { faker } from '@faker-js/faker';
import type { GateReading, GateRun } from '../ports/types.ts';
import { brandSchemas } from '../rows/brand-schemas.ts';

type MockGateReadingInput =
  | ({ readonly status: 'passed' } & Partial<GateRun>)
  | ({
      readonly status: 'blocked';
      readonly why: 'open-findings' | 'failed-call' | 'unreadable';
    } & Partial<GateRun>)
  | { readonly status: 'not-covered'; readonly head?: GateRun['head'] };

// A review gate's reading at a random head, with no open finding and no model call unless the
// test gives them.
export function buildMockGateReading(input: MockGateReadingInput): GateReading {
  const head =
    input.head ?? brandSchemas.commitSha.parse(faker.git.commitSha({ length: 40 }).toLowerCase());

  if (input.status === 'not-covered') {
    return { status: 'not-covered', head, cost: { calls: [] } };
  }

  const run: GateRun = {
    head,
    open: input.open ?? { high: 0, medium: 0, low: 0 },
    closedWithoutFix: input.closedWithoutFix ?? 0,
    findingPaths: input.findingPaths ?? [],
    cost: input.cost ?? { calls: [] },
    ref: input.ref ?? `review-${faker.string.alphanumeric(8)}`,
    answerHint: input.answerHint ?? 'Reply to each open finding with a disposition.',
  };

  return input.status === 'passed'
    ? { status: 'passed', ...run }
    : { status: 'blocked', why: input.why, ...run };
}
