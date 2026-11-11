import { limitSchema } from '@boxxy/model';
import type { LimitFill } from '@boxxy/model';
import type { Kysely } from 'kysely';
import { parseJSONText } from '../codecs/parse-json-text.ts';
import type { StoreDatabase } from '../types.ts';

// the limits of the last sync, by name, each with its held seats counted
export async function readLimitFills(db: Kysely<StoreDatabase>): Promise<LimitFill[]> {
  const rows = await db
    .selectFrom('limits')
    .selectAll()
    .select((builder) =>
      builder
        .selectFrom('limit_seats')
        .select(builder.fn.countAll<number>().as('held'))
        .whereRef('limit_seats.limit', '=', 'limits.name')
        .where('limit_seats.released_at', 'is', null)
        .as('held'),
    )
    .orderBy('name')
    .execute();

  return rows.map((row) => {
    const limit = limitSchema.parse({
      name: row.name,
      max: row.max,
      counts: parseJSONText(row.counts),
    });

    return { name: limit.name, max: limit.max, counts: limit.counts, held: row.held ?? 0 };
  });
}
