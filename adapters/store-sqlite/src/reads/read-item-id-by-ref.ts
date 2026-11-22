import { brandSchemas } from '@boxxy/model';
import type { ItemId, ItemRef } from '@boxxy/model';
import type { Kysely } from 'kysely';
import type { StoreDatabase } from '../types.ts';

export async function readItemIdByRef(
  db: Kysely<StoreDatabase>,
  ref: ItemRef,
): Promise<ItemId | null> {
  const row = await db
    .selectFrom('items')
    .select('id')
    .where('ref', '=', Number(ref.slice(2)))
    .executeTakeFirst();

  return row === undefined ? null : brandSchemas.itemId.parse(row.id);
}

export async function readItemRef(db: Kysely<StoreDatabase>, id: ItemId): Promise<ItemRef | null> {
  const row = await db.selectFrom('items').select('ref').where('id', '=', id).executeTakeFirst();

  return row === undefined ? null : brandSchemas.itemRef.parse(`i-${row.ref}`);
}
