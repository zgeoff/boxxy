import type { LimitSeatRow } from '@boxxy/model';

// the key of the store's unique index over the held seats
export function isSameHeldSeat(seat: LimitSeatRow, held: LimitSeatRow): boolean {
  return (
    seat.limit === held.limit &&
    seat.attempt === held.attempt &&
    seat.holdGen === held.holdGen &&
    held.releasedAt === null
  );
}
