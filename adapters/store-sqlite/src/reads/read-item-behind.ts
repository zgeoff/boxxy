import { brandSchemas } from '@boxxy/model';
import type { ItemId, StoreReader } from '@boxxy/model';
import type { Kysely } from 'kysely';
import type { StoreDatabase } from '../types.ts';

export async function readItemBehind(
  db: Kysely<StoreDatabase>,
  item: ItemId,
): ReturnType<StoreReader['readItemBehind']> {
  const row = await db
    .selectFrom('outbox')
    .select((builder) => [
      builder.fn.countAll<number>().as('facts'),
      builder.fn.min('at').as('oldest'),
    ])
    .where('sent_at', 'is', null)
    .where('entity', '=', `boxxy:item:${item}`)
    .executeTakeFirstOrThrow();

  return {
    facts: row.facts,
    oldestAt: row.oldest === null ? null : brandSchemas.instant.parse(row.oldest),
  };
}
