import { isFilterMatch } from '../planning/is-filter-match.ts';
import type { Limit } from '../planning/types.ts';
import type { AttemptRow, AttemptState, Instant, LimitSeatRow } from '../types.ts';

export interface SeatSync {
  // held seats to release
  readonly release: readonly LimitSeatRow[];
  readonly take: readonly LimitSeatRow[];
}

interface SeatSyncInput {
  // the limits as the rules now load them
  readonly limits: readonly Limit[];

  // the seats with no release time
  readonly held: readonly LimitSeatRow[];
  readonly attempts: readonly AttemptRow[];
  readonly at: Instant;
}

// A sleeping attempt holds no seat, and a settled one has released its seats.
const seatedStates: ReadonlySet<AttemptState> = new Set([
  'starting',
  'reconciling',
  'running',
  'waking',
  'closing',
]);

// The seats follow the loaded limits, matched against each attempt's stored fields: a seat of a
// limit that went, or that no longer counts its attempt, is released; a seated attempt gets a seat
// in each limit that now counts it, past `max` when the limit is full.
export function collectSeatSync(input: SeatSyncInput): SeatSync {
  const seated = new Map(
    input.attempts
      .filter((attempt) => seatedStates.has(attempt.state))
      .map((attempt) => [attempt.id, attempt]),
  );

  const release = input.held.filter((seat) => {
    const limit = input.limits.find((candidate) => candidate.name === seat.limit);
    const attempt = seated.get(seat.attempt);

    return (
      limit === undefined || (attempt !== undefined && !isFilterMatch(limit.counts, attempt.fields))
    );
  });

  const kept = input.held.filter((seat) => !release.includes(seat));
  const take: LimitSeatRow[] = [];

  for (const limit of input.limits) {
    let count = kept.filter((seat) => seat.limit === limit.name).length;

    for (const attempt of seated.values()) {
      const hasSeat = kept.some(
        (seat) =>
          seat.limit === limit.name &&
          seat.attempt === attempt.id &&
          seat.holdGen === attempt.holdGen,
      );

      if (!hasSeat && isFilterMatch(limit.counts, attempt.fields)) {
        take.push({
          limit: limit.name,
          attempt: attempt.id,
          holdGen: attempt.holdGen,
          overCap: count >= limit.max,
          takenAt: input.at,
          releasedAt: null,
        });

        count += 1;
      }
    }
  }

  return { release, take };
}
