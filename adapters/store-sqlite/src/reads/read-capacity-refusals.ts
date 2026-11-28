import type { CapacityRefusals } from '@boxxy/model';
import type { Kysely } from 'kysely';
import { parseStoreRow } from '../codecs/parse-store-row.ts';
import type { StoreDatabase } from '../types.ts';

// An attempt that has a session counts as a spawn that worked. A refusal that shares its tick with
// that spawn counts: the two tables keep no order between a spawn and a refusal of one tick.
export async function readCapacityRefusals(db: Kysely<StoreDatabase>): Promise<CapacityRefusals> {
  const started = await db
    .selectFrom('attempts')
    .select('started_at')
    .where('atc_session', 'is not', null)
    .where('started_at', 'is not', null)
    .orderBy('started_at', 'desc')
    .limit(1)
    .executeTakeFirst();

  const latest = await db
    .selectFrom('capacity_refusals')
    .selectAll()
    .orderBy('at', 'desc')
    .orderBy('id', 'desc')
    .limit(1)
    .executeTakeFirst();

  const counted = await db
    .selectFrom('capacity_refusals')
    .select((builder) => builder.fn.countAll<number>().as('total'))
    .where('at', '>=', started?.started_at ?? 0)
    .executeTakeFirstOrThrow();

  if (latest === undefined) {
    return { latest: null, count: 0 };
  }

  const row = parseStoreRow('capacity_refusals', latest);

  return {
    latest: { attempt: row.attempt, at: row.at, refusal: row.refusal },
    count: counted.total,
  };
}
