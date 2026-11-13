import type { AttemptRow } from '@boxxy/model';

// The columns a move is decided on: the ones the machine's guards read, and a job's read and
// mark times.
const attemptGuardColumns = [
  'state',
  'holdGen',
  'suspendRequestedAt',
  'wakeRequestedAt',
  'closing',
  'atcSession',
  'strayedAt',
  'sessionStoppedAt',
  'sessionForgottenAt',
  'readAt',
  'actedAt',
] as const satisfies readonly (keyof AttemptRow)[];

export type AttemptGuard = Pick<AttemptRow, (typeof attemptGuardColumns)[number]>;

// True when the row agrees with each guard column the caller decided on. A caller that passes a
// whole row checks every column; a caller that passes some columns checks only those.
export function isSameGuard(seen: Partial<AttemptGuard>, row: AttemptRow): boolean {
  return attemptGuardColumns.every((column) => !(column in seen) || seen[column] === row[column]);
}
