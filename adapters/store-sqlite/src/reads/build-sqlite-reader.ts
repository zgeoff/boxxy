import { formatCanonicalJson } from '@boxxy/content-hash';
import { brandSchemas, limitSeatRowSchema, outboxFactSchema, toJSONValue } from '@boxxy/model';
import type { ItemView, ItemWithLevers, StoreReader } from '@boxxy/model';
import type { Kysely } from 'kysely';
import { parseJSONText } from '../codecs/parse-json-text.ts';
import { parseStoreRow } from '../codecs/parse-store-row.ts';
import type { StoreDatabase } from '../types.ts';
import { isLatestOfSession } from './is-latest-of-session.ts';
import { readItemViews } from './read-item-views.ts';
import { readLimitFills } from './read-limit-fills.ts';
import { readWakes } from './read-wakes.ts';

export function buildSQLiteReader(db: Kysely<StoreDatabase>): StoreReader {
  return {
    readSnapshot: async (now, rules) => {
      const views = await readItemViews(
        db,
        (builder) => builder('closed_at', 'is', null),
        now,
        rules,
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
        limits: await readLimitFills(db),
        wakes: await readWakes(db),
      };
    },
    readItem: async (id, now, rules) => {
      const views = await readItemViews(db, (builder) => builder('id', '=', id), now, rules);

      const item = views.at(0);

      return item === undefined ? null : toItemView(item);
    },
    readItemDetail: async (id, now, rules) => {
      const views = await readItemViews(db, (builder) => builder('id', '=', id), now, rules);

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

      const notes = await db
        .selectFrom('notes')
        .selectAll()
        .where('item', '=', id)
        .orderBy('seq')
        .execute();

      return {
        item,
        attempts: attempts.map((row) => parseStoreRow('attempts', row)),
        relations: relations.map((row) => parseStoreRow('relations', row)),
        evidence: evidence.map((row) => parseStoreRow('evidence', row)),
        pullRequests: pullRequests.map((row) => parseStoreRow('pull_requests', row)),
        notes: notes.map((row) => parseStoreRow('notes', row)),
      };
    },
    listItems: async (filter, now, rules) => {
      const repo = filter.repo;

      const views = await readItemViews(
        db,
        (builder) => (repo === undefined ? builder.lit(true) : builder('repo', '=', repo)),
        now,
        rules,
      );

      return views.filter(
        (item) => filter.state === undefined || item.derived.state === filter.state,
      );
    },
    listOpenIssues: async (repo, now, rules) => {
      const views = await readItemViews(
        db,
        (builder) =>
          builder.and([
            builder('kind', '=', 'core.issue'),
            builder('repo', '=', repo),
            builder('closed_at', 'is', null),
          ]),
        now,
        rules,
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
    listItemAttempts: async (item) => {
      const rows = await db
        .selectFrom('attempts')
        .selectAll()
        .where('item', '=', item)
        .orderBy('claimed_at')
        .orderBy('id')
        .execute();

      return rows.map((row) => parseStoreRow('attempts', row));
    },
    listLiveAttempts: async () => {
      const rows = await db
        .selectFrom('attempts')
        .selectAll()
        .where('state', 'not in', ['succeeded', 'failed'])
        .orderBy('claimed_at')
        .orderBy('id')
        .execute();

      return rows.map((row) => parseStoreRow('attempts', row));
    },
    listStrayAttempts: async (since) => {
      const rows = await db
        .selectFrom('attempts')
        .selectAll()
        .where('strayed_at', '>=', since)
        .where('session_stopped_at', 'is', null)
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
        .orderBy('claimed_at', 'desc')
        .orderBy('id', 'desc')
        .executeTakeFirst();

      return row === undefined ? null : parseStoreRow('attempts', row);
    },
    // oxlint-disable-next-line zgeoff/verb-contract -- the StoreReader port in @boxxy/model fixes this name
    findAttemptByAgentSession: async (session) => {
      const row = await db
        .selectFrom('attempts')
        .select('id')
        .where(
          'id',
          'in',
          db.selectFrom('attempt_sessions').select('attempt').where('agent_session', '=', session),
        )
        .orderBy('claimed_at', 'desc')
        .orderBy('id', 'desc')
        .executeTakeFirst();

      return row === undefined ? null : brandSchemas.attemptId.parse(row.id);
    },
    // oxlint-disable-next-line zgeoff/verb-contract -- the StoreReader port in @boxxy/model fixes this name
    findSessionByCaller: async (caller) => {
      // the store keeps the caller as canonical JSON, so equal callers are equal text
      const stored = formatCanonicalJson(toJSONValue(caller));

      const rows = await db
        .selectFrom('attempts')
        .select('atc_session')
        .distinct()
        .where('caller', '=', stored)
        .where((builder) => isLatestOfSession(builder))
        .limit(2)
        .execute();

      if (rows.length > 1) {
        return 'ambiguous';
      }

      const session = rows.at(0)?.atc_session;

      return session === undefined || session === null
        ? null
        : brandSchemas.atcSessionId.parse(session);
    },
    readPullRequestRow: async (ref) => {
      const row = await db
        .selectFrom('pull_requests')
        .selectAll()
        .where('repo', '=', ref.repo)
        .where('number', '=', ref.number)
        .executeTakeFirst();

      return row === undefined ? null : parseStoreRow('pull_requests', row);
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
    listLimits: () => readLimitFills(db),
    listLimitSeats: async () => {
      const rows = await db
        .selectFrom('limit_seats')
        .selectAll()
        .where('released_at', 'is', null)
        .orderBy('limit')
        .orderBy('attempt')
        .execute();

      return rows.map((row) =>
        limitSeatRowSchema.parse({
          limit: row.limit,
          attempt: row.attempt,
          holdGen: row.hold_gen,
          overCap: row.over_cap === 1,
          takenAt: row.taken_at,
          releasedAt: row.released_at,
        }),
      );
    },
    listItemNotes: async (item) => {
      const rows = await db
        .selectFrom('notes')
        .selectAll()
        .where('item', '=', item)
        .orderBy('seq')
        .execute();

      return rows.map((row) => parseStoreRow('notes', row));
    },
    listUnsentNotices: async (limit) => {
      const rows = await db
        .selectFrom('notices')
        .selectAll()
        .where('sent_at', 'is', null)
        .orderBy('id')
        .limit(limit)
        .execute();

      return rows.map((row) => parseStoreRow('notices', row));
    },
    listKeptSessions: async () => {
      const rows = await db
        .selectFrom('items')
        .selectAll()
        .where('kept_session', 'is not', null)
        .orderBy('filed_at')
        .orderBy('id')
        .execute();

      return rows
        .flatMap((row) => {
          const item = parseStoreRow('items', row);

          return item.keptSession === null ? [] : [{ item: item.id, kept: item.keptSession }];
        })
        .toSorted((first, second) => first.kept.keptAt - second.kept.keptAt);
    },
    listSessionsToForget: async (failedEndedBefore) => {
      const keptRows = await db
        .selectFrom('items')
        .selectAll()
        .where('kept_session', 'is not', null)
        .execute();

      const kept = new Set(
        keptRows.flatMap((row) => {
          const keptSession = parseStoreRow('items', row).keptSession;

          return keptSession === null ? [] : [keptSession.atcSession];
        }),
      );

      const rows = await db
        .selectFrom('attempts')
        .selectAll()
        .where('atc_session', 'is not', null)
        .where('session_forgotten_at', 'is', null)
        .where((builder) => isLatestOfSession(builder))
        .where((builder) =>
          builder.or([
            builder('strayed_at', 'is', null),
            builder('session_stopped_at', 'is not', null),
          ]),
        )
        .where((builder) => {
          const failedBefore = builder.and([
            builder('state', '=', 'failed'),
            builder('ended_at', '<=', failedEndedBefore),
          ]);

          return builder.or([builder('state', '=', 'succeeded'), failedBefore]);
        })
        .orderBy('claimed_at')
        .orderBy('id')
        .execute();

      return rows
        .map((row) => parseStoreRow('attempts', row))
        .filter((attempt) => attempt.atcSession === null || !kept.has(attempt.atcSession));
    },
    readRunner: async (id) => {
      const row = await db
        .selectFrom('runners')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();

      return row === undefined ? null : parseStoreRow('runners', row);
    },
    readUnsentFacts: async (limit) => {
      const rows = await db
        .selectFrom('outbox')
        .selectAll()
        .where('sent_at', 'is', null)
        .where('parked_at', 'is', null)
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
          parkedAt: row.parked_at,
          parkedReason: row.parked_reason,
        }),
      );
    },
    readOutboxCounts: async () => {
      const waiting = await db
        .selectFrom('outbox')
        .select((builder) => [
          builder.fn.countAll<number>().as('waiting'),
          builder.fn.count<number>('parked_at').as('parked'),
        ])
        .where('sent_at', 'is', null)
        .executeTakeFirstOrThrow();

      const unsent = await db
        .selectFrom('outbox')
        .select((builder) => builder.fn.min('at').as('oldest'))
        .where('sent_at', 'is', null)
        .where('parked_at', 'is', null)
        .executeTakeFirstOrThrow();

      return {
        unsent: waiting.waiting - waiting.parked,
        parked: waiting.parked,
        oldestUnsentAt: unsent.oldest === null ? null : brandSchemas.instant.parse(unsent.oldest),
      };
    },
    readItemBehind: async (item) => {
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
