import type { MockedFactType } from '@boxxy/model/test-utils/build-mock-work-fact';
import type { WorkFact } from '../work/types.ts';
import { buildMockAppliedFact } from './build-mock-applied-fact.ts';
import { toScopeFact } from './to-scope-fact.ts';

// One fact as the consumer reads it from its scope: a model fact through the sink's wire form,
// with the fact ID that ingest gives it.
export function buildMockScopeFact(
  type: MockedFactType,
  overrides: Parameters<typeof buildMockAppliedFact>[1] = {},
): WorkFact {
  return toScopeFact(buildMockAppliedFact(type, overrides));
}
