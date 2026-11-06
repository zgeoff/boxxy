import type { ContentHash } from '@boxxy/content-hash';
import type {
  AttemptId,
  AttemptRow,
  CriterionId,
  EvidenceRow,
  FactId,
  ForcedFailure,
  Instant,
  ItemView,
  KnownFailure,
  LiveAttemptState,
  Minutes,
  RecipeName,
  RepoName,
} from './core.ts';
import type { Friction, OpenItem } from './facts.ts';
import type { SessionReading, SpawnRequest } from './ports.ts';

export interface SpawnContext {
  readonly repoPaths: ReadonlyMap<RepoName, string>;
  readonly pluginFolder: { readonly path: string; readonly hash: ContentHash };
  readonly promptTemplates: ReadonlyMap<RecipeName, string>;
}

export interface Claim {
  readonly attempt: AttemptRow;
  readonly spawn: SpawnRequest;
}

export type ReconcileAction =
  | {
      readonly kind: 'move-to-running';
      readonly fact: 'boxxy.attempt.started' | 'boxxy.attempt.reconciled';
    }
  | { readonly kind: 'bind-session' }
  | { readonly kind: 'settle' }
  | { readonly kind: 'fail'; readonly failure: Extract<KnownFailure, 'session-lost'> }
  | {
      readonly kind: 'respawn';
      readonly giveUpAfter: Minutes;
      readonly then: Extract<KnownFailure, 'spawn-lost'>;
    };

export type ReconcileTable = Readonly<
  Record<SessionReading['kind'], Readonly<Record<LiveAttemptState, ReconcileAction>>>
>;

export interface Settlement {
  readonly state: 'succeeded' | 'failed';
  readonly failure: string | null;
  readonly openItems: readonly OpenItem[];
  readonly criteria: readonly {
    readonly criterion: CriterionId;
    readonly evidence: readonly FactId[];
  }[];
  readonly friction: readonly Friction[];
  readonly frictionDropped: number;
}

export interface SettleRule<Out = unknown> {
  settle: (input: SettleInput<Out>) => Settlement;
}

export interface SettleInput<Out> {
  readonly attempt: AttemptRow;
  readonly item: ItemView;
  readonly closeOut: CloseOutParse<Out> | null;

  // a `forced` reason wins over the close-out's state
  readonly forced: ForcedFailure | null;
  readonly now: Instant;
}

export interface CloseOutContext {
  readonly item: ItemView;
  readonly attempt: AttemptId;

  // the attempt's own evidence rows
  readonly evidence: readonly EvidenceRow[];
}

export type CloseOutProblem =
  | { readonly kind: 'schema'; readonly path: string; readonly message: string }
  | { readonly kind: 'unknown-criterion'; readonly criterion: CriterionId }
  | { readonly kind: 'foreign-evidence'; readonly evidence: FactId }
  | { readonly kind: 'built-without-evidence'; readonly criteria: readonly CriterionId[] };

export type CloseOutParse<Out> =
  | { readonly kind: 'valid'; readonly closeOut: Out }
  | { readonly kind: 'invalid'; readonly problems: readonly CloseOutProblem[] };

export interface CloseOutParser<Out> {
  parse: (raw: unknown, ctx: CloseOutContext) => CloseOutParse<Out>;
}
