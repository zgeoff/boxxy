import type { ContentHash, JsonValue } from '@boxxy/content-hash';
import type { CloseOut, Effect, Friction } from '../closeouts/types.ts';
import type { SeatRef } from '../planning/types.ts';
import type { WakeSource } from '../ports/types.ts';
import type {
  ActorRef,
  AgentSessionId,
  AtcSessionId,
  AttemptId,
  CallerIdentity,
  ClosingCause,
  CommitSha,
  Criterion,
  CriterionId,
  DecisionRow,
  DesignMode,
  EvidenceKind,
  FactId,
  FieldValues,
  Instant,
  ItemId,
  ItemKindName,
  ItemRow,
  LeverRow,
  Minutes,
  PhaseName,
  PoolName,
  Product,
  RecipeHash,
  RelationTypeName,
  RepoName,
  RulesVersion,
  SessionMode,
} from '../types.ts';

// Every fact on the stream names an item; a fact about an attempt names the attempt in its
// payload. The consumer rebuilds an item from the one scope of the item.
export type EntityRef = `boxxy:item:${string}`;

export interface FactEnvelope<M extends object, T extends keyof M & string = keyof M & string> {
  readonly id: FactId;
  readonly type: T;

  // oxlint-disable-next-line id-length -- pepys's fact envelope names this field
  readonly v: 1;
  readonly api: 'boxxy/1';
  readonly entity: EntityRef;
  readonly actor: ActorRef;
  readonly at: Instant;
  readonly payload: M[T] & { readonly storeVersion: number };
}

export interface NewFact<T extends FactType> {
  readonly id: FactId;
  readonly type: T;
  readonly entity: EntityRef;
  readonly actor: ActorRef;
  readonly payload: WorkFacts[T];
}

export type AnyNewFact = { [T in FactType]: NewFact<T> }[FactType];

export interface OutboxFact {
  readonly seq: number;
  readonly factId: FactId;
  readonly type: FactType;
  readonly entity: EntityRef;
  readonly actor: ActorRef;
  readonly at: Instant;
  readonly payload: JsonValue;
  readonly sentAt: Instant | null;

  // when the sender gave the row up, and why: `too-large`, `unknown-type` or the sink's refusal
  readonly parkedAt: Instant | null;
  readonly parkedReason: string | null;
}

export type FactType = keyof WorkFacts;

export interface RelationPayload {
  readonly source: ItemId;
  readonly target: ItemId;
  readonly type: RelationTypeName;
}

interface OfAttempt {
  readonly attempt: AttemptId;
}

// The fact catalog of the stream `facts.boxxy.work`. A payload holds no `storeVersion`: the sink
// adds it to the wire form. Instants in a payload are epoch milliseconds.
export interface WorkFacts {
  // the kept session is state between two attempts, and no fact carries it
  'boxxy.item.filed': Omit<ItemRow, 'keptSession'>;
  'boxxy.item.noted': { readonly seq: number; readonly text: string };
  'boxxy.item.edited': {
    readonly title?: string;
    readonly outcome?: string;
    readonly acceptance?: readonly Criterion[];
    readonly kind?: ItemKindName;
    readonly fields?: { readonly designMode?: DesignMode };

    // the whole new list
    readonly labels?: readonly string[];

    // the attempt whose settle made the edit
    readonly byAttempt: AttemptId | null;
  };
  'boxxy.item.closed': {
    readonly reason: string;
    readonly byAttempt: AttemptId | null;
    readonly ended: readonly {
      readonly attempt: AttemptId;
      readonly how: 'settled' | 'closing';
    }[];
  };

  // the entity is the source item
  'boxxy.relation.added': RelationPayload;
  'boxxy.relation.removed': RelationPayload;
  'boxxy.lever.recorded': LeverRow;
  'boxxy.attempt.claimed': OfAttempt & {
    readonly phase: PhaseName;
    readonly number: number;
    readonly round: number;
    readonly mode: SessionMode;
    readonly pool: PoolName;
    readonly fields: FieldValues;
    readonly seats: readonly SeatRef[];
    readonly recipeHash: RecipeHash;

    // the skills pin of the rules at the claim
    readonly skillsRef: CommitSha | null;
    readonly rulesVersion: RulesVersion;
  };

  // The sink adds `storeVersion` to every payload, so the decision's own field takes another name.
  'boxxy.decision.recorded': Omit<DecisionRow, 'storeVersion'> & {
    readonly snapshotStoreVersion: number;
  };
  'boxxy.attempt.started': OfAttempt & {
    readonly atcSession: AtcSessionId;
    readonly resumeFallback: boolean;
    readonly caller: CallerIdentity | null;
  };
  'boxxy.attempt.spawn_unanswered': OfAttempt & { readonly reason: string };
  'boxxy.attempt.reconciled': OfAttempt & {
    readonly atcSession: AtcSessionId;
    readonly caller: CallerIdentity | null;
  };
  'boxxy.attempt.session_bound': OfAttempt & {
    readonly atcSession: AtcSessionId;
    readonly agentSession: AgentSessionId;
    readonly product: Product;
    readonly source: 'worker' | 'hook';
    readonly seenAt: Instant;
  };
  'boxxy.attempt.slept': OfAttempt & { readonly idleSince: Instant; readonly asked: boolean };
  'boxxy.attempt.wake_requested': OfAttempt & { readonly by: WakeSource };
  'boxxy.attempt.woken': OfAttempt & {
    readonly holdGen: number;
    readonly seats: readonly SeatRef[];
    readonly overCap: boolean;
  };
  'boxxy.attempt.resumed': OfAttempt & {
    readonly atcSession: AtcSessionId;
    readonly caller: CallerIdentity | null;
  };
  'boxxy.attempt.closed_out': OfAttempt & {
    readonly phase: PhaseName;
    readonly closeOut: CloseOut;
    readonly hash: ContentHash;
  };
  'boxxy.attempt.timed_out': OfAttempt & {
    readonly phase: PhaseName;
    readonly afterMinutes: Minutes;
  };
  'boxxy.attempt.turn_ended': OfAttempt & { readonly phase: PhaseName };
  'boxxy.attempt.settled': OfAttempt & {
    readonly phase: PhaseName;
    readonly round: number;
    readonly state: 'succeeded' | 'failed';
    readonly failure: string | null;

    // a name the phase kind lists, or an engine outcome
    readonly outcome: string;
    readonly returnedOutcome: string | null;

    // null: the session was already gone
    readonly closing: ClosingCause | null;
    readonly asleep: boolean;

    // false: settled by the give-up rule
    readonly sessionStopped: boolean;
    readonly endedAt: Instant;
    readonly criteria: readonly {
      readonly criterion: CriterionId;
      readonly evidence: readonly FactId[];
    }[];
    readonly matched: readonly ItemId[];
    readonly frictionDropped: number;
    readonly skippedEffects: readonly {
      readonly effect: Effect['kind'];
      readonly reason: string;
    }[];
  };
  'boxxy.proposal.recorded': OfAttempt & Friction;
  'boxxy.evidence.recorded': OfAttempt & {
    readonly kind: EvidenceKind;
    readonly ref: string;
    readonly observed: string | null;
  };
  'boxxy.pull_request.linked': OfAttempt & {
    readonly repo: RepoName;
    readonly number: number;
    readonly url: string;

    // the decimal text of GitHub's own ID of the pull request
    readonly pullRequestId: string;
    readonly source: 'hook' | 'watch';
  };
  'boxxy.commit.linked': OfAttempt & {
    readonly repo: RepoName;
    readonly sha: CommitSha;
    readonly pullRequestNumber: number;
  };
  'boxxy.pull_request.merged': OfAttempt & {
    readonly repo: RepoName;
    readonly number: number;
    readonly pullRequestId: string;
    readonly mergedAt: Instant;
    readonly mergeCommit: CommitSha;
  };
  'boxxy.pull_request.closed': OfAttempt & {
    readonly repo: RepoName;
    readonly number: number;
    readonly pullRequestId: string;
  };
}
