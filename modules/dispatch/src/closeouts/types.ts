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
  PullRequestRow,
  RelationRow,
  RowWrite,
} from '@boxxy/model';
import type { AttemptGuard } from '../attempts/is-same-guard.ts';

// What one effect of a settle writes, or why it writes nothing.
export type EffectPlan =
  | {
      readonly kind: 'apply';
      readonly effect: Effect;
      readonly writes: readonly RowWrite[];
      readonly facts: readonly AnyNewFact[];

      // a part of the effect that writes nothing, such as the `duplicate-of` relation of a close
      // when that relation is live already
      readonly skipped?: readonly SkippedPart[];
    }
  | { readonly kind: 'skip'; readonly effect: Effect; readonly reason: string };

interface SkippedPart {
  readonly effect: Effect['kind'];
  readonly reason: string;
}

// What an effect handler reads. A handler does no I/O: settle reads these first.
export interface EffectContext {
  readonly attempt: AttemptRow;

  // the attempt's item, open or closed
  readonly item: ItemView;
  readonly rules: LoadedRules;

  // the live relations of the attempt's item, from it and to it
  readonly relations: readonly RelationRow[];

  // every live `blocks` relation of the store, which the loop check walks; read only when an
  // effect adds a `blocks` relation, and empty otherwise
  readonly blocks: readonly RelationRow[];

  // the rows of the pull requests that the item's attempts made, in any state
  readonly pullRequests: readonly PullRequestRow[];
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

  // the cause that ends the attempt with the outcome `lost`; null settles by the close-out.
  // `closeout-unsettleable`: the phase kind refused the close-out the runner built for a job.
  readonly forced: ForcedFailure | 'closeout-unsettleable' | null;

  // false: settled by the give-up rule while the session still ran
  readonly sessionStopped: boolean;

  // the guard columns of the row the caller decided on, when it read the row before the lock
  readonly seen?: Partial<AttemptGuard>;
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

  // the body that the phase kind's parser reads
  readonly body: unknown;

  // the body the session sent, when the server built `body` from it; the repeat check hashes it
  readonly sent?: unknown;
  readonly rules: LoadedRules;
  readonly now: Instant;
  readonly newId: NewId;
}
