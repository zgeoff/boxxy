import type {
  ActorRef,
  AnyNewFact,
  AtcSessionId,
  AttemptId,
  AttemptRow,
  CallerIdentity,
  ClaimStore,
  Effect,
  ForcedFailure,
  Instant,
  ItemView,
  LoadedRules,
  NewId,
  RelationRow,
  RowWrite,
} from '@boxxy/model';

// What one effect of a settle writes, or why it writes nothing.
export type EffectPlan =
  | {
      readonly kind: 'apply';
      readonly effect: Effect;
      readonly writes: readonly RowWrite[];
      readonly facts: readonly AnyNewFact[];
    }
  | { readonly kind: 'skip'; readonly effect: Effect; readonly reason: string };

// What an effect handler reads. A handler does no I/O: settle reads these first.
export interface EffectContext {
  readonly attempt: AttemptRow;

  // the attempt's item, open or closed
  readonly item: ItemView;
  readonly rules: LoadedRules;

  // the live relations of the attempt's item
  readonly relations: readonly RelationRow[];
  readonly actor: ActorRef;
  readonly now: Instant;
  readonly newId: NewId;
}

// One handler for each kind of effect.
export type EffectHandlers = {
  readonly [Kind in Effect['kind']]: (
    effect: Extract<Effect, { kind: Kind }>,
    ctx: EffectContext,
  ) => EffectPlan;
};

export interface SettleAttemptInput {
  readonly store: ClaimStore;
  readonly attempt: AttemptId;

  // the cause that ends the attempt with the outcome `lost`; null settles by the close-out
  readonly forced: ForcedFailure | null;

  // false: settled by the give-up rule while the session still ran
  readonly sessionStopped: boolean;
  readonly rules: LoadedRules;
  readonly actor: ActorRef;
  readonly now: Instant;
  readonly newId: NewId;
}

// What every call from inside a session gives the core. `attempt` comes from the request: the ID
// the session read with `attempt.current`. `session` and `caller` come from the edge, which
// proved the caller and found its session.
export interface CallRef {
  readonly attempt: AttemptId;
  readonly session: AtcSessionId;
  readonly caller: CallerIdentity;
}

export interface CloseOutInput {
  readonly store: ClaimStore;
  readonly call: CallRef;
  readonly body: unknown;
  readonly rules: LoadedRules;
  readonly now: Instant;
  readonly newId: NewId;
}
