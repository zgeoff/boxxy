import type {
  Concept,
  ItemId,
  ItemView,
  LoadRejection,
  Position,
  Resolved,
  RetryLever,
  Settled,
  SignalKey,
} from '@boxxy/model';

export interface Checked<T> {
  readonly value: T | null;
  readonly rejections: readonly LoadRejection[];
}

export interface ResolvedSignal {
  readonly key: SignalKey;
  readonly resolved: Resolved<'signal'>;
}

export interface PinnedConcept {
  readonly concept: Concept;
  readonly entryIndex: number;
}

export interface RulesDryRunLine {
  readonly item: ItemId;

  // under the rules the server runs
  readonly now: Position;

  // under the proposed rules
  readonly then: Position;
  readonly moved: boolean;
}

export interface DryRunItem {
  readonly item: ItemView;

  // the item's settled attempts, oldest first
  readonly attempts: readonly Settled[];
  readonly retries: readonly RetryLever[];
}
