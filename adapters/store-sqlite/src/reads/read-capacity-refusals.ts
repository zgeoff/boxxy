import type { CapacityRefusals } from '@boxxy/model';
import type { Kysely } from 'kysely';
import { parseStoreRow } from '../codecs/parse-store-row.ts';
import type { StoreDatabase } from '../types.ts';

// An attempt that has a session counts as a spawn that worked. Attempt IDs rise in the order of the
// claims, so within one tick a refusal counts when its attempt was claimed after the spawn's.
export async function readCapacityRefusals(db: Kysely<StoreDatabase>): Promise<CapacityRefusals> {
  const started = await db
    .selectFrom('attempts')
    .select(['id', 'started_at'])
    .where('atc_session', 'is not', null)
    .where('started_at', 'is not', null)
    .orderBy('started_at', 'desc')
    .orderBy('id', 'desc')
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
    .where((builder) => {
      if (started === undefined) {
        return builder.val(true);
      }

      const startedAt = started.started_at ?? 0;

      return builder.or([
        builder('at', '>', startedAt),
        builder.and([builder('at', '=', startedAt), builder('attempt', '>', started.id)]),
      ]);
    })
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
