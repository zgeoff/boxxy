import type {
  ActorRef,
  AtcSessionId,
  AttemptId,
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

  // the strays with no session whose lookup by the spawn name threw; tried again on the next tick
  readonly unread: readonly UnreadStray[];
}

export interface UnreadStray {
  readonly attempt: AttemptId;
  readonly error: unknown;
}

export interface KeptForgetInput {
  readonly kept: KeptSession;

  // null when the store has no such item
  readonly item: ItemView | null;

  // the latest attempt that the kept session carries
  readonly latest: AttemptRow | null;
  readonly now: Instant;
}
