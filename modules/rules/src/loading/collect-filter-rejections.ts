import type { Filter, LoadRejection, Registry } from '@boxxy/model';
import type { ParsedRulesFile } from '../parse/rules-file-schema.ts';
import { buildRejection } from './build-rejection.ts';
import { toFilter } from './to-filter.ts';

export function collectFilterRejections(
  file: ParsedRulesFile,
  registry: Registry,
): LoadRejection[] {
  const fields = registry['filter-field'];
  const limitCounts = file.limits.map((limit) => toFilter(limit.counts));

  const unknownFields = [
    ...file.limits.map((limit, index) => ({
      filter: limit.counts,
      path: ['limits', index, 'counts'],
    })),
    ...file.pools.map((pool, index) => ({ filter: pool.takes, path: ['pools', index, 'takes'] })),
  ].flatMap((entry) =>
    Object.keys(entry.filter)
      .filter((field) => !fields.has(field))
      .map((field) =>
        buildRejection([...entry.path, field], { kind: 'unknown-filter-field', field }),
      ),
  );

  const unbounded = file.pools.flatMap((pool, index) =>
    limitCounts.some((counts) => isSureToCount(counts, toFilter(pool.takes)))
      ? []
      : [buildRejection(['pools', index], { kind: 'pool-without-limit', pool: pool.name })],
  );

  return [...unknownFields, ...unbounded];
}

// A limit counts every attempt of a pool only when each field it filters on is one the pool takes
// on too, with no value the limit leaves out.
function isSureToCount(counts: Filter, takes: Filter): boolean {
  return Object.entries(counts).every(([field, counted]) => {
    const taken = Object.hasOwn(takes, field) ? takes[field] : undefined;

    return taken !== undefined && taken.every((value) => counted.includes(value));
  });
}
