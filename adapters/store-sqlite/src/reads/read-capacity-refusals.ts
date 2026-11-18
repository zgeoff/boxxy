import type { CapacityRefusals } from '@boxxy/model';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';
import { parseStoreRow } from '../codecs/parse-store-row.ts';
import type { StoreDatabase } from '../types.ts';

// An attempt that has a session counts as a spawn that worked.
export async function readCapacityRefusals(db: Kysely<StoreDatabase>): Promise<CapacityRefusals> {
  const refused = db.selectFrom('attempts').where('failure', '=', 'no-capacity');

  // Rows keep the order they were claimed in, so the row id breaks a tie between a spawn and a
  // refusal of the same tick.
  const started = await db
    .selectFrom('attempts')
    .select(['started_at', sql`rowid`.as('position')])
    .where('atc_session', 'is not', null)
    .where('started_at', 'is not', null)
    .orderBy('started_at', 'desc')
    .orderBy(sql`rowid`, 'desc')
    .limit(1)
    .executeTakeFirst();

  const latest = await refused
    .selectAll()
    .orderBy('ended_at', 'desc')
    .orderBy('id', 'desc')
    .limit(1)
    .executeTakeFirst();

  const position = z.number().parse(started?.position ?? 0);

  const counted = await refused
    .select((builder) => builder.fn.countAll<number>().as('total'))
    .where((builder) => {
      if (started === undefined) {
        return builder.val(true);
      }

      const startedAt = started.started_at ?? 0;

      const sameTickAfter = builder.and([
        builder('ended_at', '=', startedAt),
        builder(sql`rowid`, '>', position),
      ]);

      return builder.or([builder('ended_at', '>', startedAt), sameTickAfter]);
    })
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
