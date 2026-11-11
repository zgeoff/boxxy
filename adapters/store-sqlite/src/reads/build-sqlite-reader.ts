import { brandSchemas, outboxFactSchema } from '@boxxy/model';
import type {
  SliceOneItemView as ItemView,
  SliceOneItemWithLevers as ItemWithLevers,
  PoolName,
  StoreReader,
} from '@boxxy/model';
import type { Kysely } from 'kysely';
import { parseStoreRow } from '../codecs/parse-store-row.ts';
import type { StoreDatabase } from '../types.ts';
import { readItemViews } from './read-item-views.ts';

export function buildSQLiteReader(db: Kysely<StoreDatabase>): StoreReader {
  return {
    readSnapshot: async (now, maxAttemptsByKind) => {
      const views = await readItemViews(
        db,
        (builder) => builder('closed_at', 'is', null),
        now,
        maxAttemptsByKind,
      );

      const open = views.filter((item) => isOpen(item));

      const relations = await db
        .selectFrom('relations')
        .selectAll()
        .where('removed_at', 'is', null)
        .orderBy('added_at')
        .orderBy('source')
        .orderBy('target')
        .execute();

      const version = await db
        .selectFrom('outbox')
        .select((builder) => builder.fn.max('seq').as('seq'))
        .executeTakeFirst();

      return {
        storeVersion: version?.seq ?? 0,
        items: open.map((item) => toItemView(item)),
        relations: relations.map((row) => parseStoreRow('relations', row)),
        levers: open
          .flatMap((item) => item.levers)
          .toSorted((first, second) => first.seq - second.seq),
        freeSlots: await readFreeSlots(db),
      };
    },
    readItem: async (id, now, maxAttemptsByKind) => {
      const views = await readItemViews(
        db,
        (builder) => builder('id', '=', id),
        now,
        maxAttemptsByKind,
      );

      const item = views.at(0);

      return item === undefined ? null : toItemView(item);
    },
    readItemDetail: async (id, now, maxAttemptsByKind) => {
      const views = await readItemViews(
        db,
        (builder) => builder('id', '=', id),
        now,
        maxAttemptsByKind,
      );

      const item = views.at(0);

      if (item === undefined) {
        return null;
      }

      const attemptsOfItem = db.selectFrom('attempts').select('id').where('item', '=', id);

      const attempts = await db
        .selectFrom('attempts')
        .selectAll()
        .where('item', '=', id)
        .orderBy('claimed_at')
        .orderBy('id')
        .execute();

      const relations = await db
        .selectFrom('relations')
        .selectAll()
        .where('removed_at', 'is', null)
        .where((builder) => builder.or([builder('source', '=', id), builder('target', '=', id)]))
        .orderBy('added_at')
        .orderBy('source')
        .orderBy('target')
        .execute();

      const evidence = await db
        .selectFrom('evidence')
        .selectAll()
        .where('attempt', 'in', attemptsOfItem)
        .orderBy('at')
        .orderBy('fact_id')
        .execute();

      const pullRequests = await db
        .selectFrom('pull_requests')
        .selectAll()
        .where('attempt', 'in', attemptsOfItem)
        .orderBy('repo')
        .orderBy('number')
        .execute();

      return {
        item,
        attempts: attempts.map((row) => parseStoreRow('attempts', row)),
        relations: relations.map((row) => parseStoreRow('relations', row)),
        evidence: evidence.map((row) => parseStoreRow('evidence', row)),
        pullRequests: pullRequests.map((row) => parseStoreRow('pull_requests', row)),
      };
    },
    listItems: async (filter, now, maxAttemptsByKind) => {
      const repo = filter.repo;

      const views = await readItemViews(
        db,
        (builder) => (repo === undefined ? builder.lit(true) : builder('repo', '=', repo)),
        now,
        maxAttemptsByKind,
      );

      return views.filter(
        (item) => filter.state === undefined || item.derived.state === filter.state,
      );
    },
    listOpenIssues: async (repo, now, maxAttemptsByKind) => {
      const views = await readItemViews(
        db,
        (builder) =>
          builder.and([
            builder('kind', '=', 'core.issue'),
            builder('repo', '=', repo),
            builder('closed_at', 'is', null),
          ]),
        now,
        maxAttemptsByKind,
      );

      return views.filter((item) => isOpen(item)).map((item) => toItemView(item));
    },
    readLastLeaseGen: async (item, phase) => {
      const row = await db
        .selectFrom('leases')
        .select((builder) => builder.fn.max('gen').as('gen'))
        .where('item', '=', item)
        .where('phase', '=', phase)
        .executeTakeFirst();

      return row?.gen ?? 0;
    },
    readAttempt: async (id) => {
      const row = await db
        .selectFrom('attempts')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();

      return row === undefined ? null : parseStoreRow('attempts', row);
    },
    listEvidence: async (attempt) => {
      const rows = await db
        .selectFrom('evidence')
        .selectAll()
        .where('attempt', '=', attempt)
        .orderBy('at')
        .orderBy('fact_id')
        .execute();

      return rows.map((row) => parseStoreRow('evidence', row));
    },
    listLiveAttempts: async () => {
      const rows = await db
        .selectFrom('attempts')
        .selectAll()
        .where('state', 'in', ['starting', 'running', 'reconciling'])
        .orderBy('claimed_at')
        .orderBy('id')
        .execute();

      return rows.map((row) => parseStoreRow('attempts', row));
    },
    listSucceededAttemptsWithoutPullRequest: async () => {
      const linked = db.selectFrom('pull_requests').select('attempt');

      const rows = await db
        .selectFrom('attempts')
        .selectAll()
        .where('state', '=', 'succeeded')
        .where('id', 'not in', linked)
        .orderBy('claimed_at')
        .orderBy('id')
        .execute();

      return rows.map((row) => parseStoreRow('attempts', row));
    },
    // oxlint-disable-next-line zgeoff/verb-contract -- the StoreReader port in @boxxy/model fixes this name
    findAttemptBySession: async (session) => {
      const row = await db
        .selectFrom('attempts')
        .selectAll()
        .where('atc_session', '=', session)
        .orderBy('claimed_at')
        .orderBy('id')
        .executeTakeFirst();

      return row === undefined ? null : parseStoreRow('attempts', row);
    },
    // oxlint-disable-next-line zgeoff/verb-contract -- the StoreReader port in @boxxy/model fixes this name
    findAttemptByAgentSession: async (session) => {
      const row = await db
        .selectFrom('attempt_sessions')
        .select('attempt')
        .where('agent_session', '=', session)
        .executeTakeFirst();

      return row === undefined ? null : brandSchemas.attemptId.parse(row.attempt);
    },
    listWatchedPullRequests: async () => {
      const rows = await db
        .selectFrom('pull_requests')
        .selectAll()
        .where('state', '=', 'open')
        .orderBy('repo')
        .orderBy('number')
        .execute();

      return rows.map((row) => parseStoreRow('pull_requests', row));
    },
    listPoolSlots: async () => {
      const rows = await db
        .selectFrom('pool_slots')
        .selectAll()
        .orderBy('pool')
        .orderBy('slot')
        .execute();

      return rows.map((row) => parseStoreRow('pool_slots', row));
    },
    readUnsentFacts: async (limit) => {
      const rows = await db
        .selectFrom('outbox')
        .selectAll()
        .where('sent_at', 'is', null)
        .orderBy('seq')
        .limit(limit)
        .execute();

      return rows.map((row) =>
        outboxFactSchema.parse({
          seq: row.seq,
          factId: row.fact_id,
          type: row.type,
          entity: row.entity,
          actor: row.actor,
          at: row.at,
          payload: parseJSONText(row.payload),
          sentAt: row.sent_at,
        }),
      );
    },
    readOutboxLag: async () => {
      const row = await db
        .selectFrom('outbox')
        .select((builder) => [
          builder.fn.countAll<number>().as('unsent'),
          builder.fn.min('at').as('oldest'),
        ])
        .where('sent_at', 'is', null)
        .executeTakeFirstOrThrow();

      const oldest = row.oldest === null ? null : brandSchemas.instant.parse(row.oldest);

      return { unsent: row.unsent, oldestUnsentAt: oldest };
    },
    readRunner: async (id) => {
      const row = await db
        .selectFrom('runners')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();

      return row === undefined ? null : parseStoreRow('runners', row);
    },
  };
}

function isOpen(item: ItemView): boolean {
  return item.derived.state !== 'done' && item.derived.state !== 'archived';
}

function toItemView(item: ItemWithLevers): ItemView {
  const { levers: _levers, ...view } = item;

  return view;
}

async function readFreeSlots(db: Kysely<StoreDatabase>): Promise<Record<PoolName, number>> {
  const rows = await db
    .selectFrom('pool_slots')
    .select(['pool', 'holder'])
    .where('retired', '=', 0)
    .execute();

  const free: Record<PoolName, number> = {};

  for (const row of rows) {
    const pool = brandSchemas.poolName.parse(row.pool);

    free[pool] = (free[pool] ?? 0) + (row.holder === null ? 1 : 0);
  }

  return free;
}

function parseJSONText(text: string): unknown {
  const parsed: unknown = JSON.parse(text);

  return parsed;
}
