import { buildItemViews } from '@boxxy/model';
import type { Instant, ItemWithLevers, MaxAttemptsByKind } from '@boxxy/model';
import type { Expression, ExpressionBuilder, Kysely, SqlBool } from 'kysely';
import { parseStoreRow } from '../codecs/parse-store-row.ts';
import type { StoreDatabase } from '../types.ts';

export type ItemScope = (builder: ExpressionBuilder<StoreDatabase, 'items'>) => Expression<SqlBool>;

// a target's state needs each blocker's own state, so this loads the blockers too
export async function readItemViews(
  db: Kysely<StoreDatabase>,
  scope: ItemScope,
  now: Instant,
  maxAttemptsByKind: MaxAttemptsByKind,
): Promise<ItemWithLevers[]> {
  const scoped = db.selectFrom('items').select('id').where(scope);

  const blockers = db
    .selectFrom('links')
    .select('source')
    .where('removed_at', 'is', null)
    .where('target', 'in', scoped);

  const loaded = db
    .selectFrom('items')
    .select('id')
    .where((builder) => builder.or([builder('id', 'in', scoped), builder('id', 'in', blockers)]));

  const attemptsOfLoaded = db.selectFrom('attempts').select('id').where('item', 'in', loaded);

  const items = await db
    .selectFrom('items')
    .selectAll()
    .where('id', 'in', loaded)
    .orderBy('filed_at')
    .orderBy('id')
    .execute();

  const scopedRows = await scoped.execute();

  const inScope = new Set(scopedRows.map((row) => row.id));

  const links = await db
    .selectFrom('links')
    .selectAll()
    .where('removed_at', 'is', null)
    .where('target', 'in', loaded)
    .execute();

  const levers = await db
    .selectFrom('levers')
    .selectAll()
    .where('item', 'in', loaded)
    .orderBy('seq')
    .execute();

  const attempts = await db
    .selectFrom('attempts')
    .selectAll()
    .where('item', 'in', loaded)
    .orderBy('claimed_at')
    .orderBy('id')
    .execute();

  const leases = await db
    .selectFrom('leases')
    .selectAll()
    .where('released_at', 'is', null)
    .where('item', 'in', loaded)
    .execute();

  const pullRequests = await db
    .selectFrom('pull_requests')
    .selectAll()
    .where('attempt', 'in', attemptsOfLoaded)
    .execute();

  const views = buildItemViews(
    {
      items: items.map((row) => parseStoreRow('items', row)),
      links: links.map((row) => parseStoreRow('links', row)),
      levers: levers.map((row) => parseStoreRow('levers', row)),
      attempts: attempts.map((row) => parseStoreRow('attempts', row)),
      liveLeases: leases.map((row) => parseStoreRow('leases', row)),
      pullRequests: pullRequests.map((row) => parseStoreRow('pull_requests', row)),
    },
    now,
    maxAttemptsByKind,
  );

  return views.filter((view) => inScope.has(view.id));
}
