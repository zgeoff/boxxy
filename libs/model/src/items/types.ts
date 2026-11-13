import type {
  ActorRef,
  AttemptRow,
  Instant,
  ItemRow,
  ItemView,
  LeaseRow,
  LeverRow,
  PullRequestRow,
  RelationRow,
} from '../types.ts';

// the rows a store reads to derive a set of items, with each blocking source item
export interface ItemSetRows {
  readonly items: readonly ItemRow[];

  // live relations only
  readonly relations: readonly RelationRow[];
  readonly levers: readonly LeverRow[];
  readonly attempts: readonly AttemptRow[];
  readonly liveLeases: readonly LeaseRow[];
  readonly pullRequests: readonly PullRequestRow[];
}

// One `boxxy.item.edited` fact of an item: when, by whom, and the names of the fields it set.
export interface ItemRevision {
  readonly seq: number;
  readonly at: Instant;
  readonly actor: ActorRef;
  readonly changed: readonly string[];
}

export interface ItemWithLevers extends ItemView {
  // the live levers only
  readonly levers: readonly LeverRow[];
}
