import type { ItemId, ItemShipped } from '@boxxy/model';
import type { Kysely } from 'kysely';
import { parseStoreRow } from '../codecs/parse-store-row.ts';
import type { StoreDatabase } from '../types.ts';

export async function readShipped(db: Kysely<StoreDatabase>, item: ItemId): Promise<ItemShipped[]> {
  const rows = await db
    .selectFrom('item_shipped')
    .selectAll()
    .where('item_id', '=', item)
    .orderBy('seen_at')
    .orderBy('commit')
    .execute();

  return rows.map((row) => parseStoreRow('item_shipped', row));
}
