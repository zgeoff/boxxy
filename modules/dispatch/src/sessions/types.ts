import type {
  ActorRef,
  AtcSessionId,
  AttemptRow,
  ClaimStore,
  Instant,
  ItemView,
  KeptSession,
  LoadedRules,
  NewId,
  WorkerKind,
} from '@boxxy/model';

export interface ForgetSessionsInput {
  readonly store: ClaimStore;
  readonly worker: WorkerKind;
  readonly rules: LoadedRules;
  readonly actor: ActorRef;
  readonly now: Instant;
  readonly newId: NewId;
}

// The sessions this tick forgot, and those whose forget the worker did not confirm. A failed
// forget is tried again on the next tick.
export interface ForgetReport {
  readonly forgotten: readonly AtcSessionId[];
  readonly failed: readonly AtcSessionId[];
}

export interface KeptForgetInput {
  readonly kept: KeptSession;

  // null when the store has no such item
  readonly item: ItemView | null;

  // the latest attempt that the kept session carries
  readonly latest: AttemptRow | null;
  readonly now: Instant;
}
