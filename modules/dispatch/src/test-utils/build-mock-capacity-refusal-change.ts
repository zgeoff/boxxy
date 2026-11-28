import type { CapacityRefusalRow, StoreChange } from '@boxxy/model';

export function buildMockCapacityRefusalChange(row: CapacityRefusalRow): StoreChange {
  return {
    at: row.at,
    writes: [{ op: 'insert', table: 'capacity_refusals', row }],
    facts: [],
  };
}
