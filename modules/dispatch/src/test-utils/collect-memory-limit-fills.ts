import type { LimitFill } from '@boxxy/model';
import { compareText } from './compare-text.ts';
import type { MemoryTables } from './types.ts';

export function collectMemoryLimitFills(tables: MemoryTables): LimitFill[] {
  const fills = tables.limits.map((limit) => {
    const held = tables.limit_seats.filter(
      (seat) => seat.limit === limit.name && seat.releasedAt === null,
    );

    return { ...limit, held: held.length };
  });

  return fills.toSorted((first, second) => compareText(first.name, second.name));
}
