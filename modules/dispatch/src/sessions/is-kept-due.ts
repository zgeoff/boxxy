import { timeouts } from '../timeouts.ts';
import type { KeptForgetInput } from './types.ts';

const hourMs = 3_600_000;

// Whether the kept session is due to be forgotten: its item is done or closed, or it was kept
// `keptSessionHours` ago. A session that a live later attempt runs on is never due. Pure.
export function isKeptDue(input: KeptForgetInput): boolean {
  if (
    input.latest !== null &&
    input.latest.id !== input.kept.attempt &&
    input.latest.endedAt === null
  ) {
    return false;
  }

  const item = input.item;
  const expired = input.now - input.kept.keptAt >= timeouts.keptSessionHours * hourMs;

  return (
    item === null ||
    item.closedAt !== null ||
    item.derived.state === 'done' ||
    item.derived.state === 'archived' ||
    expired
  );
}
