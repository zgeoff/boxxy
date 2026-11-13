import type { JsonValue } from '@boxxy/content-hash';
import { toJSONValue } from '../utils/to-json-value.ts';
import type { MergeObservation } from './types.ts';

// The JSON form that the merge observation schema reads: the checks as an object by name, because
// a Map has no JSON form.
export function toMergeObservationJSON(observation: MergeObservation): JsonValue {
  return toJSONValue({ ...observation, checks: Object.fromEntries(observation.checks) });
}
