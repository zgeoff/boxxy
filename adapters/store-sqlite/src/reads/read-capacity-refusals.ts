import type { CapacityRefusals } from '@boxxy/model';
import type { Kysely } from 'kysely';
import { parseStoreRow } from '../codecs/parse-store-row.ts';
import type { StoreDatabase } from '../types.ts';

// An attempt that has a session counts as a spawn that worked.
export async function readCapacityRefusals(db: Kysely<StoreDatabase>): Promise<CapacityRefusals> {
  const refused = db.selectFrom('attempts').where('failure', '=', 'no-capacity');

  const started = await db
    .selectFrom('attempts')
    .select((builder) => builder.fn.max('started_at').as('at'))
    .where('atc_session', 'is not', null)
    .executeTakeFirstOrThrow();

  const latest = await refused
    .selectAll()
    .orderBy('ended_at', 'desc')
    .orderBy('id', 'desc')
    .limit(1)
    .executeTakeFirst();

  const counted = await refused
    .select((builder) => builder.fn.countAll<number>().as('total'))
    .where('ended_at', '>', started.at ?? 0)
    .executeTakeFirstOrThrow();

  if (latest === undefined) {
    return { latest: null, count: 0 };
  }

  const row = parseStoreRow('attempts', latest);

  return {
    latest: { attempt: row.id, at: row.endedAt ?? row.claimedAt, refusal: row.refusal },
    count: counted.total,
  };
}
