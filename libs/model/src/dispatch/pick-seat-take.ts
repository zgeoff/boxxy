import type { LimitFill, SeatTake } from '../planning/types.ts';
import type { Instant, LimitName, LimitSeatRow } from '../types.ts';

export type SeatTakeAnswer =
  | { readonly kind: 'take'; readonly seats: readonly LimitSeatRow[] }
  | { readonly kind: 'limit-full' | 'unknown-limit'; readonly limit: LimitName };

// All or none: one seat in each named limit, or the first limit that refuses. A take over the
// cap ignores `max`, and still refuses a limit that the store does not hold.
export function pickSeatTake(
  take: SeatTake,
  limits: readonly LimitFill[],
  at: Instant,
): SeatTakeAnswer {
  const names = [...new Set(take.limits)];

  for (const name of names) {
    const limit = limits.find((candidate) => candidate.name === name);

    if (limit === undefined) {
      return { kind: 'unknown-limit', limit: name };
    }

    if (!take.overCap && limit.held >= limit.max) {
      return { kind: 'limit-full', limit: name };
    }
  }

  const seats = names.map((limit): LimitSeatRow => ({
    limit,
    attempt: take.attempt,
    holdGen: take.holdGen,
    overCap: take.overCap,
    takenAt: at,
    releasedAt: null,
  }));

  return { kind: 'take', seats };
}
