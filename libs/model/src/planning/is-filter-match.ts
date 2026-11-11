import type { FieldValues } from '../types.ts';
import type { Filter } from './types.ts';

// For every field of the filter, one of the values is in the filter's list; an empty filter
// matches every value set.
export function isFilterMatch(filter: Filter, fields: FieldValues): boolean {
  return Object.entries(filter).every(([field, accepted]) =>
    (fields[field] ?? []).some((value) => accepted.includes(value)),
  );
}
