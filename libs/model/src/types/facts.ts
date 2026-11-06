import type { JsonValue } from '@boxxy/content-hash';
import type {
  ActorRef,
  AgentSessionId,
  AtcSessionId,
  CommitSha,
  Criterion,
  CriterionId,
  DecisionRow,
  EvidenceKind,
  FactId,
  Instant,
  ItemId,
  ItemRow,
  LeverRow,
  LinkTypeName,
  PhaseName,
  PoolName,
  RecipeHash,
  RepoName,
  RulesVersion,
  RunnerId,
} from './core.ts';

export interface BuildCloseOut {
  readonly result:
    | { readonly kind: 'built' }
    | { readonly kind: 'blocked'; readonly reason: string }
    | { readonly kind: 'abandoned'; readonly reason: string };
  readonly criteria: readonly { readonly criterion: CriterionId; readonly evidence: FactId }[];
  readonly openItems: readonly OpenItem[];
  readonly friction: readonly Friction[];
  readonly frictionDropped: number;
}

export interface OpenItem {
  readonly kind: 'core.issue';
  readonly title: string;
  readonly body: string;
}

export type FrictionTargetKind = 'skill' | 'rule' | 'lint' | 'agents-md' | 'tool';

export interface Friction {
  readonly target: { readonly kind: FrictionTargetKind; readonly name: string };
  readonly change: string;
}

export type EntityRef =
  | `boxxy:item:${string}`
  | `boxxy:link:${string}:${string}:${string}`
  | `boxxy:attempt:${string}`
  | `boxxy:decision:${string}`
  | `boxxy:runner:${string}`;

export interface FactEnvelope<
  M extends object = SliceOneFacts,
  T extends keyof M & string = keyof M & string,
> {
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

export interface NewFact<T extends keyof M & string, M extends object = SliceOneFacts> {
  readonly id: FactId;
  readonly type: T;
  readonly entity: EntityRef;
  readonly actor: ActorRef;
  readonly payload: M[T];
}

export interface OutboxFact {
  readonly seq: number;
  readonly factId: FactId;
  readonly type: string;
  readonly entity: EntityRef;
  readonly actor: ActorRef;
  readonly at: Instant;
  readonly payload: JsonValue;
  readonly sentAt: Instant | null;
}

export type FactType = keyof SliceOneFacts;

export interface LinkPayload {
  readonly source: ItemId;
  readonly target: ItemId;
  readonly type: LinkTypeName;
}

export interface SliceOneFacts {
  'boxxy.item.filed': ItemRow;
  'boxxy.item.edited': {
    readonly title?: string;
    readonly outcome?: string;
    readonly acceptance?: readonly Criterion[];
  };
  'boxxy.item.closed': { readonly reason: string };
  'boxxy.link.added': LinkPayload;
  'boxxy.link.removed': LinkPayload;
  'boxxy.lever.recorded': LeverRow;
  'boxxy.attempt.claimed': {
    readonly item: ItemId;
    readonly phase: PhaseName;
    readonly number: number;
    readonly pool: PoolName;
    readonly slot: number;
    readonly gen: number;
    readonly recipeHash: RecipeHash;
    readonly rulesVersion: RulesVersion;
  };
  'boxxy.decision.recorded': DecisionRow;
  'boxxy.attempt.started': { readonly atcSession: AtcSessionId };
  'boxxy.attempt.reconciling': { readonly reason: string };
  'boxxy.attempt.reconciled': { readonly atcSession: AtcSessionId };
  'boxxy.attempt.session_bound': {
    readonly atcSession: AtcSessionId;
    readonly agentSession: AgentSessionId;
    readonly seenAt: Instant;
  };
  'boxxy.attempt.closed_out': { readonly closeOut: BuildCloseOut };
  'boxxy.attempt.settled': {
    readonly state: 'succeeded' | 'failed';
    readonly failure: string | null;
    readonly endedAt: Instant;
    readonly criteria: readonly {
      readonly criterion: CriterionId;
      readonly evidence: readonly FactId[];
    }[];
    readonly matched: readonly ItemId[];
    readonly frictionDropped: number;
  };
  'boxxy.evidence.recorded': {
    readonly kind: EvidenceKind;
    readonly ref: string;
    readonly observed: string | null;
  };
  'boxxy.evidence.pr_linked': {
    readonly repo: RepoName;
    readonly number: number;
    readonly url: string;
  };
  'boxxy.evidence.commit_linked': {
    readonly repo: RepoName;
    readonly sha: CommitSha;
    readonly pr: number;
  };
  'boxxy.pr.merged': {
    readonly repo: RepoName;
    readonly number: number;
    readonly mergedAt: Instant;
    readonly mergeCommit: CommitSha;
  };
  'boxxy.pr.closed': { readonly repo: RepoName; readonly number: number };
  'boxxy.proposal.recorded': Friction;
  'boxxy.runner.paused': { readonly runner: RunnerId };
  'boxxy.runner.resumed': { readonly runner: RunnerId };
}
