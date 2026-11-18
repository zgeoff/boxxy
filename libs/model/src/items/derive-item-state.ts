import type { Position } from '../pipeline/types.ts';
import type { WaitAnswer } from '../rules/types.ts';
import type {
  AttemptRow,
  DerivedState,
  ItemId,
  ItemRow,
  ItemState,
  LeaseRow,
  PhaseName,
  PullRequestRow,
  RelationRow,
} from '../types.ts';
import { collectBuildPullRequests } from './collect-build-pull-requests.ts';

export interface WaitedAnswer {
  readonly kind: string;
  readonly answer: WaitAnswer;
}

interface DeriveItemStateInput {
  readonly item: ItemRow;
  readonly position: Position;

  // the reason of the item's held lever, or null when the item is not held
  readonly heldReason: string | null;

  // the item's live item-phase lease, a sleeping or closing attempt's included
  readonly liveLease: LeaseRow | null;

  // the phase kinds loaded now, by name
  readonly phases: ReadonlyMap<PhaseName, { readonly needsAcceptance: boolean }>;
  readonly attempts: readonly AttemptRow[];
  readonly pullRequests: readonly PullRequestRow[];

  // the live relations whose target is the item
  readonly relations: readonly RelationRow[];
  readonly blockerStates: ReadonlyMap<ItemId, ItemState>;

  // The answer of each wait of the item's step, which the caller runs, so this code names no
  // wait kind. Empty when the item is not at a step with waits.
  readonly waitAnswers: readonly WaitedAnswer[];
}

// The table of section G of the engine sketch; the first match wins.
export function deriveItemState(input: DeriveItemStateInput): DerivedState {
  const item = input.item;
  const position = input.position;

  if (item.closedAt !== null) {
    return { state: 'archived' };
  }

  if (input.heldReason !== null) {
    return { state: 'held', reason: input.heldReason };
  }

  if (input.liveLease !== null) {
    return { state: 'running' };
  }

  if (position.kind === 'hold') {
    return { state: 'waiting', reason: position.reason };
  }

  if (position.kind === 'end') {
    return deriveEndedState(collectBuildPullRequests(input.attempts, input.pullRequests));
  }

  if (item.acceptance.length === 0 && input.phases.get(position.phase)?.needsAcceptance === true) {
    return { state: 'idea' };
  }

  // `holds` and `skip` leave the item ready, so the claim sees it
  const waiting = input.waitAnswers.find((wait) => wait.answer === 'waiting');

  if (waiting !== undefined) {
    return { state: 'waiting', reason: `wait:${waiting.kind}` };
  }

  return hasOpenBlocker(input) ? { state: 'blocked' } : { state: 'ready' };
}

function deriveEndedState(linked: readonly PullRequestRow[]): DerivedState {
  if (linked.some((pullRequest) => pullRequest.state === 'merged')) {
    return { state: 'done' };
  }

  if (linked.some((pullRequest) => pullRequest.state === 'open')) {
    return { state: 'waiting', reason: 'pull request open' };
  }

  return linked.length === 0
    ? { state: 'waiting', reason: 'no pull request linked' }
    : { state: 'waiting', reason: 'pull request closed unmerged' };
}

function hasOpenBlocker(input: DeriveItemStateInput): boolean {
  return input.relations.some((relation) => {
    const blockerState = input.blockerStates.get(relation.source);

    return relation.type === 'blocks' && blockerState !== 'done' && blockerState !== 'archived';
  });
}
