import type {
  ActorRef,
  AgentSessionId,
  AtcSessionId,
  AttemptId,
  AttemptRow,
  AttemptSessionRow,
  AttemptState,
  CallerIdentity,
  CloseOut,
  ClosingCause,
  CommitSha,
  DecisionRow,
  FactId,
  FactType,
  Instant,
  Minutes,
  NewId,
  ResolvedRecipe,
  RunnerId,
  SessionMode,
  StartPick,
  WakePick,
  WakeSource,
  WorkFacts,
} from '@boxxy/model';

// What the guards of the attempt machine read. Each field comes from one column of the attempt
// row.
export interface AttemptContext {
  // `suspendRequestedAt` is set
  readonly mark: boolean;

  // `wakeRequestedAt` is set
  readonly wakeRequested: boolean;
  readonly mode: SessionMode;
  readonly holdGen: number;
  readonly closing: ClosingCause | null;

  // `atcSession` is set
  readonly hasSession: boolean;

  // `strayedAt` is set
  readonly strayed: boolean;

  // `sessionStoppedAt` is set
  readonly sessionStopped: boolean;

  // `sessionForgottenAt` is set
  readonly sessionForgotten: boolean;
}

// The machine's events. XState names the kind `type`; `claimed` is the initial transition and
// has no event.
export type AttemptMachineEvent =
  | { readonly type: 'started'; readonly via: 'start' | 'reconcile' }
  | { readonly type: 'woken'; readonly overCap: boolean }
  | {
      readonly type: 'settled';
      readonly state: 'succeeded' | 'failed';
      readonly sessionStopped: boolean;
    }
  | {
      readonly type:
        | 'spawn-unanswered'
        | 'session-seen'
        | 'closed-out'
        | 'timed-out'
        | 'item-closed'
        | 'turn-ended'
        | 'stalled'
        | 'skill-missing'
        | 'usage-limited'
        | 'suspend-asked'
        | 'suspend-refused'
        | 'slept'
        | 'wake-requested'
        | 'resumed'
        | 'wake-refused'
        | 'stray-stopped'
        | 'session-forgotten';
    };

// A write that a move makes besides the attempt row, or a fact it records.
export type MoveEffect =
  | 'take-lease'
  | 'release-lease'
  | 'take-seats'
  | 'release-seats'
  | 'record-decision'
  | 'bind-session'
  | AttemptFactType;

// The facts that a move records: each attempt fact, and the decision of a claim or a wake.
// The table holds the moves of session attempts only, so it records no job's first read.
export type AttemptFactType = Exclude<
  Extract<FactType, `boxxy.attempt.${string}` | 'boxxy.decision.recorded'>,
  'boxxy.attempt.job_started'
>;

// One row of the table of moves.
export interface AttemptMove {
  readonly event: AttemptMachineEvent['type'] | 'claimed';

  // empty for `claimed`, which starts from no attempt
  readonly from: readonly AttemptState[];

  // the move is allowed only when this holds; no `when` allows it from every `from` state
  readonly when?: (context: AttemptContext, event: AttemptMachineEvent) => boolean;
  readonly to: AttemptState | 'same';
  readonly effects: readonly MoveEffect[];
  readonly context?: (
    context: AttemptContext,
    event: AttemptMachineEvent,
  ) => Partial<AttemptContext>;
}

// What the claim, a wake and the decision fact record; the builder adds the ID, the attempt and
// the time.
export type DecisionDraft = Omit<DecisionRow, 'id' | 'attempt' | 'at'>;

export interface ClaimedEvent {
  readonly kind: 'claimed';

  // made before the change, because the spawn request names it
  readonly attempt: AttemptId;
  readonly pick: StartPick;
  readonly number: number;
  readonly runner: RunnerId;

  // one above the item phase's last lease generation
  readonly leaseGen: number;
  readonly recipe: Pick<ResolvedRecipe, 'hash' | 'rulesVersion'>;
  readonly skillsRef: CommitSha | null;
  readonly spawnRequest: AttemptRow['spawnRequest'];
  readonly spawnRequestHash: AttemptRow['spawnRequestHash'];
  readonly input: AttemptRow['input'];
  readonly mode: SessionMode;

  // a claim through a resume edge copies the kept session's caller
  readonly caller: CallerIdentity | null;
  readonly decision: DecisionDraft;
}

type SettledFact = WorkFacts['boxxy.attempt.settled'];

export type MoveEvent =
  | {
      readonly kind: 'started';
      readonly via: 'start' | 'reconcile';
      readonly atcSession: AtcSessionId;
      readonly caller: CallerIdentity | null;
      readonly resumeFallback: boolean;
    }
  | { readonly kind: 'spawn-unanswered'; readonly reason: string }
  | { readonly kind: 'session-seen'; readonly row: AttemptSessionRow }
  | {
      readonly kind: 'closed-out';
      readonly closeOut: CloseOut;
      readonly hash: NonNullable<AttemptRow['closeOutHash']>;
    }
  | { readonly kind: 'timed-out'; readonly afterMinutes: Minutes }
  | { readonly kind: 'item-closed' }
  | { readonly kind: 'turn-ended' }
  | { readonly kind: 'stalled' }
  | { readonly kind: 'skill-missing' }
  | { readonly kind: 'usage-limited' }
  | { readonly kind: 'suspend-asked' }
  | { readonly kind: 'suspend-refused' }
  | { readonly kind: 'slept'; readonly idleSince: Instant; readonly asked: boolean }
  | { readonly kind: 'wake-requested'; readonly by: WakeSource }
  | {
      readonly kind: 'woken';
      readonly pick: WakePick;
      readonly decision: DecisionDraft;
      readonly overCap: boolean;
    }
  | {
      readonly kind: 'resumed';
      readonly atcSession: AtcSessionId;
      readonly caller: CallerIdentity | null;
    }
  | { readonly kind: 'wake-refused' }
  | (Pick<
      SettledFact,
      | 'state'
      | 'failure'
      | 'returnedOutcome'
      | 'sessionStopped'
      | 'criteria'
      | 'matched'
      | 'frictionDropped'
      | 'skippedEffects'
    > & {
      readonly kind: 'settled';
      readonly outcome: NonNullable<AttemptRow['outcome']>;
    })
  | {
      readonly kind: 'stray-stopped';

      // the session that the stop found by the spawn name; the row records it when it has none
      readonly atcSession: AtcSessionId | null;
    }
  | { readonly kind: 'session-forgotten' };

export type AttemptEvent = ClaimedEvent | MoveEvent;

// The rows one move reads and writes: the attempt as read, the attempt as the move leaves it,
// and the decision row of a claim or a wake.
export interface MoveParts {
  readonly before: AttemptRow;
  readonly after: AttemptRow;
  readonly event: AttemptEvent;
  readonly decision: DecisionRow | null;
}

// What every move of a caller outside the builder passes on.
export interface MoveBase {
  readonly actor: ActorRef;
  readonly now: Instant;
  readonly newId: NewId;
}

export type MoveResult =
  | { readonly kind: 'applied' }
  | { readonly kind: 'not-allowed' }

  // the store refused the change: a race the next tick reads again
  | { readonly kind: 'refused'; readonly reason: string };

export interface SeenSession {
  readonly atcSession: AtcSessionId;
  readonly agentSession: AgentSessionId;

  // the attempt whose kept session this one resumed; it holds the same agent session
  readonly keptFrom?: AttemptId | null;
}

export interface FactEnvelopeParts {
  readonly id: FactId;
  readonly actor: ActorRef;
  readonly now: Instant;
}
