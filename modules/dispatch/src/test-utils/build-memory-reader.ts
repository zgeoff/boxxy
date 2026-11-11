import { isDeepStrictEqual } from 'node:util';
import { buildItemViews } from '@boxxy/model';
import type {
  AtcSessionId,
  AttemptRow,
  EvidenceRow,
  Instant,
  ItemDetailRows,
  ItemRow,
  LeverRow,
  MaxAttemptsByKind,
  OutboxFact,
  PullRequestRow,
  RelationRow,
  SliceOneItemSetRows,
  StoreItemView,
  StoreItemWithLevers,
  StoreReader,
  Wake,
} from '@boxxy/model';
import { collectMemoryLimitFills } from './collect-memory-limit-fills.ts';
import { compareText } from './compare-text.ts';
import type { MemoryTables } from './types.ts';

// SQLite hands out new objects on each read, so a caller that keeps or edits a row never touches
// the store's own rows; each read here works on a copy to match.
export function buildMemoryReader(getLiveTables: () => MemoryTables): StoreReader {
  const getTables = () => structuredClone(getLiveTables());

  const buildViews = (now: Instant, maxAttemptsByKind: MaxAttemptsByKind): StoreItemWithLevers[] =>
    buildItemViews(toItemSetRows(getTables()), now, maxAttemptsByKind);

  return {
    readSnapshot: (now, maxAttemptsByKind) => {
      const tables = getTables();
      const open = buildViews(now, maxAttemptsByKind).filter((item) => isOpen(item));

      return Promise.resolve({
        storeVersion: tables.outbox.length,
        items: open.map((item) => toItemView(item)),
        relations: sortRelations(tables.relations.filter((row) => row.removedAt === null)),
        levers: open
          .flatMap((item) => item.levers)
          .toSorted((first, second) => first.seq - second.seq),
        limits: collectMemoryLimitFills(tables),
        wakes: collectWakes(tables.attempts),
      });
    },
    readItem: (id, now, maxAttemptsByKind) => {
      const item = buildViews(now, maxAttemptsByKind).find((view) => view.id === id);
      const view = item === undefined ? null : toItemView(item);

      return Promise.resolve(view);
    },
    readItemDetail: (id, now, maxAttemptsByKind) => {
      const tables = getTables();
      const item = buildViews(now, maxAttemptsByKind).find((view) => view.id === id);

      if (item === undefined) {
        return Promise.resolve(null);
      }

      const attempts = sortAttempts(tables.attempts.filter((attempt) => attempt.item === id));

      const attemptIds = new Set(attempts.map((attempt) => attempt.id));

      const relations = sortRelations(
        tables.relations.filter(
          (row) => row.removedAt === null && (row.source === id || row.target === id),
        ),
      );

      const detail: ItemDetailRows = {
        item,
        attempts,
        relations,
        evidence: sortEvidence(tables.evidence.filter((row) => attemptIds.has(row.attempt))),
        pullRequests: sortPullRequests(
          tables.pull_requests.filter((row) => attemptIds.has(row.attempt)),
        ),
        notes: tables.notes
          .filter((note) => note.item === id)
          .toSorted((first, second) => first.seq - second.seq),
      };

      return Promise.resolve(detail);
    },
    listItems: (filter, now, maxAttemptsByKind) =>
      Promise.resolve(
        buildViews(now, maxAttemptsByKind).filter(
          (item) =>
            (filter.state === undefined || item.derived.state === filter.state) &&
            (filter.repo === undefined || item.repo === filter.repo),
        ),
      ),
    listOpenIssues: (repo, now, maxAttemptsByKind) =>
      Promise.resolve(
        buildViews(now, maxAttemptsByKind)
          .filter((item) => item.kind === 'core.issue' && item.repo === repo && isOpen(item))
          .map((item) => toItemView(item)),
      ),
    readLastLeaseGen: (item, phase) => {
      const gens = getTables()
        .leases.filter((lease) => lease.item === item && lease.phase === phase)
        .map((lease) => lease.gen);

      return Promise.resolve(Math.max(0, ...gens));
    },
    readAttempt: (id) =>
      Promise.resolve(getTables().attempts.find((attempt) => attempt.id === id) ?? null),
    listEvidence: (attempt) =>
      Promise.resolve(sortEvidence(getTables().evidence.filter((row) => row.attempt === attempt))),
    listItemAttempts: (item) =>
      Promise.resolve(
        sortAttempts(getTables().attempts.filter((attempt) => attempt.item === item)),
      ),
    listLiveAttempts: () =>
      Promise.resolve(sortAttempts(getTables().attempts.filter((attempt) => !isSettled(attempt)))),
    listStrayAttempts: (since) =>
      Promise.resolve(
        sortAttempts(
          getTables().attempts.filter(
            (attempt) =>
              attempt.strayedAt !== null &&
              attempt.strayedAt >= since &&
              attempt.sessionStoppedAt === null,
          ),
        ),
      ),
    listSucceededAttemptsWithoutPullRequest: () => {
      const tables = getTables();

      const linked = new Set(tables.pull_requests.map((row) => row.attempt));

      return Promise.resolve(
        sortAttempts(
          tables.attempts.filter(
            (attempt) => attempt.state === 'succeeded' && !linked.has(attempt.id),
          ),
        ),
      );
    },
    findAttemptBySession: (session) =>
      Promise.resolve(
        sortAttempts(getTables().attempts).findLast((attempt) => attempt.atcSession === session) ??
          null,
      ),
    findAttemptByAgentSession: (session) => {
      const tables = getTables();

      const bound = new Set(
        tables.attempt_sessions
          .filter((row) => row.agentSession === session)
          .map((row) => row.attempt),
      );

      return Promise.resolve(
        sortAttempts(tables.attempts).findLast((attempt) => bound.has(attempt.id))?.id ?? null,
      );
    },
    findSessionByCaller: (caller) => {
      const sessions = collectLatestBySession(getTables().attempts)
        .filter((latest) => isDeepStrictEqual(latest.attempt.caller, caller))
        .map((latest) => latest.session);

      if (sessions.length > 1) {
        return Promise.resolve('ambiguous');
      }

      return Promise.resolve(sessions[0] ?? null);
    },
    listWatchedPullRequests: () =>
      Promise.resolve(
        sortPullRequests(getTables().pull_requests.filter((row) => row.state === 'open')),
      ),
    listLimits: () => Promise.resolve(collectMemoryLimitFills(getTables())),
    listLimitSeats: () => {
      const held = getTables().limit_seats.filter((seat) => seat.releasedAt === null);

      return Promise.resolve(
        held.toSorted(
          (first, second) =>
            compareText(first.limit, second.limit) || compareText(first.attempt, second.attempt),
        ),
      );
    },
    listItemNotes: (item) =>
      Promise.resolve(
        getTables()
          .notes.filter((note) => note.item === item)
          .toSorted((first, second) => first.seq - second.seq),
      ),
    listUnsentNotices: (limit) =>
      Promise.resolve(
        getTables()
          .notices.filter((notice) => notice.sentAt === null)
          .toSorted((first, second) => first.id - second.id)
          .slice(0, limit),
      ),
    listKeptSessions: () => {
      const kept = sortItems(getTables().items).flatMap((item) =>
        item.keptSession === null ? [] : [{ item: item.id, kept: item.keptSession }],
      );

      return Promise.resolve(
        kept.toSorted((first, second) => first.kept.keptAt - second.kept.keptAt),
      );
    },
    listSessionsToForget: (failedEndedBefore) => {
      const tables = getTables();

      const kept = new Set(
        tables.items.flatMap((item) =>
          item.keptSession === null ? [] : [item.keptSession.atcSession],
        ),
      );

      return Promise.resolve(
        collectLatestBySession(tables.attempts)
          .filter((latest) => !kept.has(latest.session))
          .map((latest) => latest.attempt)
          .filter(
            (attempt) =>
              attempt.sessionForgottenAt === null &&
              (attempt.strayedAt === null || attempt.sessionStoppedAt !== null) &&
              (attempt.state === 'succeeded' ||
                (attempt.state === 'failed' &&
                  attempt.endedAt !== null &&
                  attempt.endedAt <= failedEndedBefore)),
          ),
      );
    },
    readRunner: (id) => Promise.resolve(getTables().runners.find((row) => row.id === id) ?? null),
    readUnsentFacts: (limit) =>
      Promise.resolve(
        getTables()
          .outbox.filter((fact) => fact.sentAt === null && fact.parkedAt === null)
          .slice(0, limit),
      ),
    readOutboxCounts: () => {
      const waiting = getTables().outbox.filter((fact) => fact.sentAt === null);
      const unsent = waiting.filter((fact) => fact.parkedAt === null);

      return Promise.resolve({
        unsent: unsent.length,
        parked: waiting.length - unsent.length,
        oldestUnsentAt: findOldestAt(unsent),
      });
    },
    readItemBehind: (item) => {
      const behind = getTables().outbox.filter(
        (fact) => fact.sentAt === null && fact.entity === `boxxy:item:${item}`,
      );

      return Promise.resolve({ facts: behind.length, oldestAt: findOldestAt(behind) });
    },
  };
}

function toItemSetRows(tables: MemoryTables): SliceOneItemSetRows<ItemRow, LeverRow> {
  return {
    items: sortItems(tables.items),
    relations: tables.relations.filter((relation) => relation.removedAt === null),
    levers: tables.levers.toSorted((first, second) => first.seq - second.seq),
    attempts: sortAttempts(tables.attempts),
    liveLeases: tables.leases.filter((lease) => lease.releasedAt === null),
    pullRequests: tables.pull_requests,
  };
}

function sortItems(items: readonly ItemRow[]): ItemRow[] {
  return items.toSorted(
    (first, second) => first.filedAt - second.filedAt || compareText(first.id, second.id),
  );
}

function sortAttempts(attempts: readonly AttemptRow[]): AttemptRow[] {
  return attempts.toSorted(
    (first, second) => first.claimedAt - second.claimedAt || compareText(first.id, second.id),
  );
}

function isOpen(item: StoreItemView): boolean {
  return item.derived.state !== 'done' && item.derived.state !== 'archived';
}

function toItemView(item: StoreItemWithLevers): StoreItemView {
  const { levers: _levers, ...view } = item;

  return view;
}

function sortRelations(relations: readonly RelationRow[]): RelationRow[] {
  return relations.toSorted(
    (first, second) =>
      first.addedAt - second.addedAt ||
      compareText(first.source, second.source) ||
      compareText(first.target, second.target),
  );
}

function collectWakes(attempts: readonly AttemptRow[]): Wake[] {
  const wakes = sortAttempts(attempts).flatMap((attempt) =>
    attempt.state === 'sleeping' && attempt.wakeRequestedAt !== null
      ? [
          {
            attempt: attempt.id,
            item: attempt.item,
            phase: attempt.phase,
            pool: attempt.pool,
            fields: attempt.fields,
            requestedAt: attempt.wakeRequestedAt,
          },
        ]
      : [],
  );

  return wakes.toSorted((first, second) => first.requestedAt - second.requestedAt);
}

function sortEvidence(rows: readonly EvidenceRow[]): EvidenceRow[] {
  return rows.toSorted(
    (first, second) => first.at - second.at || compareText(first.factId, second.factId),
  );
}

function sortPullRequests(rows: readonly PullRequestRow[]): PullRequestRow[] {
  return rows.toSorted(
    (first, second) => compareText(first.repo, second.repo) || first.number - second.number,
  );
}

function isSettled(attempt: AttemptRow): boolean {
  return attempt.state === 'succeeded' || attempt.state === 'failed';
}

interface LatestOfSession {
  readonly session: AtcSessionId;
  readonly attempt: AttemptRow;
}

// the latest attempt of each atc session, in the order of those attempts
function collectLatestBySession(attempts: readonly AttemptRow[]): LatestOfSession[] {
  const latest = new Map<AtcSessionId, AttemptRow>();

  for (const attempt of sortAttempts(attempts)) {
    if (attempt.atcSession !== null) {
      latest.set(attempt.atcSession, attempt);
    }
  }

  return sortAttempts([...latest.values()]).flatMap((attempt) =>
    attempt.atcSession === null ? [] : [{ session: attempt.atcSession, attempt }],
  );
}

function findOldestAt(facts: readonly OutboxFact[]): Instant | null {
  return facts.toSorted((first, second) => first.at - second.at).at(0)?.at ?? null;
}
