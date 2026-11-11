import type {
  Decision,
  FieldValues,
  Filter,
  Frame,
  FrameItem,
  LimitFill,
  LimitName,
  Pool,
  PoolName,
  Snapshot,
  StartPick,
  Wait,
  WaitReason,
  WakePick,
} from '@boxxy/model';
import { compareItemIDs } from './compare-item-ids.ts';

interface DecideInput {
  readonly frame: Frame;
  readonly pools: readonly Pool[];
  readonly snapshot: Pick<Snapshot, 'limits' | 'wakes'>;

  // the pools whose capacity or usage-limit backoff runs at the claim's time
  readonly backoff: readonly PoolName[];
}

export function decide(input: DecideInput): Decision {
  const seats = buildSeats(input.snapshot.limits);

  const backoff = new Set(input.backoff);

  const picks: (StartPick | WakePick)[] = [];
  const waits: Wait[] = [];

  for (const wake of input.snapshot.wakes) {
    const subject = { kind: 'wake', attempt: wake.attempt } as const;
    const taken = backoff.has(wake.pool) ? backoffOf(wake.pool) : seats.take(wake.fields);

    if (taken.kind === 'taken') {
      picks.push({ kind: 'wake', attempt: wake.attempt, limits: taken.limits });
    } else {
      waits.push({ subject, reason: taken.reason });
    }
  }

  const offered = collectOffers(input.frame, input.pools);

  waits.push(...offered.unpooled);

  for (const offer of offered.offers) {
    const subject = { kind: 'item', item: offer.item.id } as const;
    const taken = backoff.has(offer.pool) ? backoffOf(offer.pool) : seats.take(offer.fields);

    if (taken.kind === 'taken') {
      picks.push({
        kind: 'start',
        item: offer.item.id,
        phase: offer.item.phase,
        round: offer.item.round,
        pool: offer.pool,
        fields: offer.fields,
        limits: taken.limits,
      });
    } else {
      waits.push({ subject, reason: taken.reason });
    }
  }

  return { picks, waits };
}

type SeatTaking =
  | { readonly kind: 'taken'; readonly limits: readonly LimitName[] }
  | { readonly kind: 'refused'; readonly reason: WaitReason };

interface Seats {
  take: (fields: FieldValues) => SeatTaking;
}

// The free seats of each limit, counted down by each pick of this decision. A limit held over its
// max after a wake over the cap has fewer than none.
function buildSeats(limits: readonly LimitFill[]): Seats {
  const free = new Map(limits.map((limit) => [limit.name, limit.max - limit.held]));

  return {
    take: (fields) => {
      const counting = limits.filter((limit) => isMatch(limit.counts, fields));
      const full = counting.find((limit) => (free.get(limit.name) ?? 0) <= 0);

      if (full !== undefined) {
        return { kind: 'refused', reason: { kind: 'limit-full', limit: full.name } };
      }

      for (const limit of counting) {
        free.set(limit.name, (free.get(limit.name) ?? 0) - 1);
      }

      return { kind: 'taken', limits: counting.map((limit) => limit.name) };
    },
  };
}

// An item matches a filter when, for every field, one of its values is in the filter's list.
function isMatch(filter: Filter, fields: FieldValues): boolean {
  return Object.entries(filter).every(([field, accepted]) =>
    (fields[field] ?? []).some((value) => accepted.includes(value)),
  );
}

function backoffOf(pool: PoolName): SeatTaking {
  return { kind: 'refused', reason: { kind: 'backoff', pool } };
}

interface Offer {
  readonly item: FrameItem;
  readonly pool: PoolName;
  readonly fields: FieldValues;
}

interface Offers {
  // in pool order, then by each pool's `order`
  readonly offers: readonly Offer[];
  readonly unpooled: readonly Wait[];
}

// Each candidate that no gate holds belongs to the first pool, in declared order, that takes it.
function collectOffers(frame: Frame, pools: readonly Pool[]): Offers {
  const free = frame.candidates.filter((item) => (frame.holds.get(item.id) ?? []).length === 0);

  const byPool = new Map<PoolName, FrameItem[]>(pools.map((pool) => [pool.name, []]));

  const unpooled: Wait[] = [];

  for (const item of free) {
    const fields = frame.fields.get(item.id) ?? {};
    const pool = pools.find((candidate) => isMatch(candidate.takes, fields));

    if (pool === undefined) {
      unpooled.push({ subject: { kind: 'item', item: item.id }, reason: { kind: 'no-pool' } });
    } else {
      byPool.get(pool.name)?.push(item);
    }
  }

  const offers = pools.flatMap((pool) =>
    (byPool.get(pool.name) ?? [])
      .toSorted((left, right) => compareCandidates(left, right, pool, frame.values))
      .map((item) => ({ item, pool: pool.name, fields: frame.fields.get(item.id) ?? {} })),
  );

  return { offers, unpooled };
}

function compareCandidates(
  left: FrameItem,
  right: FrameItem,
  pool: Pool,
  values: Frame['values'],
): number {
  for (const key of pool.order) {
    const byItem = values.get(key);
    const order = compareValues(byItem?.get(left.id), byItem?.get(right.id));

    if (order !== 0) {
      return order;
    }
  }

  return compareItemIDs(left.id, right.id);
}

function compareValues(left: number | undefined, right: number | undefined): number {
  if (left === right) {
    return 0;
  }

  if (left === undefined) {
    return 1;
  }

  if (right === undefined) {
    return -1;
  }

  return left < right ? -1 : 1;
}
