import type { Wake } from '@boxxy/model';
import type { Kysely } from 'kysely';
import { parseStoreRow } from '../codecs/parse-store-row.ts';
import type { StoreDatabase } from '../types.ts';

// the sleeping attempts whose wake was asked for, oldest request first
export async function readWakes(db: Kysely<StoreDatabase>): Promise<Wake[]> {
  const rows = await db
    .selectFrom('attempts')
    .selectAll()
    .where('state', '=', 'sleeping')
    .where('wake_requested_at', 'is not', null)
    .orderBy('wake_requested_at')
    .orderBy('claimed_at')
    .orderBy('id')
    .execute();

  return rows.flatMap((row) => {
    const attempt = parseStoreRow('attempts', row);

    return attempt.wakeRequestedAt === null
      ? []
      : [
          {
            attempt: attempt.id,
            item: attempt.item,
            phase: attempt.phase,
            pool: attempt.pool,
            fields: attempt.fields,
            requestedAt: attempt.wakeRequestedAt,
          },
        ];
  });
}
