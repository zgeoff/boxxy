import type { LoadedRules, Position } from '@boxxy/model';
import { findPosition } from '@boxxy/model';
import type { DryRunItem, RulesDryRunLine } from '../types.ts';

interface DryRunInput {
  // the rules the server runs
  readonly current: LoadedRules;

  // a rules file that passed the loader
  readonly proposed: LoadedRules;

  // the open items only
  readonly items: readonly DryRunItem[];
}

// Folds the position of each item twice over the same attempts and levers, once under each rules
// set. It writes nothing. A live attempt is not touched by a rules change, so the line of an item
// with a live attempt says where the item stands after that attempt settles as stored so far.
export function dryRunRules(input: DryRunInput): RulesDryRunLine[] {
  return input.items.map((entry) => {
    const now = foldPosition(input.current, entry);
    const next = foldPosition(input.proposed, entry);

    // oxlint-disable-next-line unicorn/no-thenable -- the wire name of the contract; never awaited
    return { item: entry.item.id, now, then: next, moved: !isSamePosition(now, next) };
  });
}

function foldPosition(rules: LoadedRules, entry: DryRunItem): Position {
  return findPosition({
    pipeline: rules.kinds.get(entry.item.kind)?.pipeline ?? null,
    attempts: entry.attempts,
    retries: entry.retries,
  });
}

function isSamePosition(left: Position, right: Position): boolean {
  if (left.kind === 'phase' && right.kind === 'phase') {
    return left.phase === right.phase && left.round === right.round;
  }

  if (left.kind === 'end' && right.kind === 'end') {
    return left.reason === right.reason;
  }

  return (
    left.kind === 'hold' &&
    right.kind === 'hold' &&
    left.reason === right.reason &&
    left.then === right.then &&
    left.round === right.round
  );
}
