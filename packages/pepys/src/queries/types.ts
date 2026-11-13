import type {
  ColumnKind,
  ConsumerDeclaration,
  EntityID,
  QueryCall,
  TableDeclaration,
} from '@pepys/kit';
import type { boxxyWorkConsumer } from '../work/boxxy-work-consumer.ts';

// The rows the statements of the two queries read. Each holds the columns of its table that the
// builders need, under the column names.

export interface AttemptReadRow {
  id: string;
  phase: string;
  number: number;
  round: number;
  state: string;
  outcome: string | null;
  failure: string | null;
  claimed_at: string;
  ended_at: string | null;

  // a JSON column: the list of sleep stretches, as text or as the parsed list
  sleeps: unknown;
}

// the stage-time query reads a review's unrelated lines too
export interface StageAttemptReadRow extends AttemptReadRow {
  unrelated_lines: number | null;
}

// A row of `boxxy_attempt_session` for every session that an attempt of the item used, with the
// rows of the other attempts, of any item, that used the same session.
export interface BindingReadRow {
  attempt_id: string;
  session_id: string;
  bound_at: string;
  caller_issuer: string | null;
  caller_subject: string | null;
}

// the proven sender of a telemetry row, and its session and time
interface TelemetryReadRow {
  session_id: string;
  origin_issuer: string | null;
  origin_subject: string | null;
  product: string;
  at: string;
}

export interface RequestReadRow extends TelemetryReadRow {
  model: string;
  cost_basis: string;
  cost_usd: number | null;
  input_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  output_tokens: number;
}

export interface TurnReadRow extends TelemetryReadRow {
  model: string | null;
  cost_usd: number;
}

// one pull request that an attempt of the item produced
export interface PullRequestReadRow {
  id: string;
  merged_at: string | null;
}

// One pull request of the item with its delivery times, as the GitHub plug-in's delivery module
// gives them. Two attempts that produced one pull request give two equal rows.
export interface DeliveryReadRow {
  pullRequest: string;
  mergedAt: string | null;
  release: { at: string } | null;
  deploy: { at: string } | null;
}

interface Column<Kind extends ColumnKind> {
  readonly kind: Kind;
}

interface NullableColumn<Kind extends ColumnKind> {
  readonly kind: Kind;
  readonly nullable: true;
}

// The columns that the queries read of each consumer of another plug-in. A consumer with more
// columns fits. A table's columns take a type alias: an interface has no index signature.
type TelemetryColumns = Readonly<{
  session_id: Column<'entityID'>;
  origin_issuer: Column<'text'>;
  origin_subject: Column<'text'>;
  product: Column<'text'>;
  at: Column<'timestamp'>;
}>;

export type TelemetryModelRequestConsumer = ConsumerDeclaration<
  'telemetry_model_request',
  {
    readonly telemetry_model_request: TableDeclaration<
      TelemetryColumns & {
        readonly model: Column<'text'>;
        readonly cost_basis: Column<'text'>;
        readonly cost_usd: NullableColumn<'real'>;
        readonly input_tokens: Column<'integer'>;
        readonly cache_read_tokens: Column<'integer'>;
        readonly cache_creation_tokens: Column<'integer'>;
        readonly output_tokens: Column<'integer'>;
      }
    >;
  }
>;

export type TelemetryTurnCostConsumer = ConsumerDeclaration<
  'telemetry_turn_cost',
  {
    readonly telemetry_turn_cost: TableDeclaration<
      TelemetryColumns & {
        readonly model: NullableColumn<'text'>;
        readonly cost_usd: Column<'real'>;
      }
    >;
  }
>;

export type GithubPullRequestConsumer = ConsumerDeclaration<
  'github_pull_request',
  {
    readonly github_pull_request: TableDeclaration<{
      readonly id: Column<'entityID'>;
      readonly merged_at: NullableColumn<'timestamp'>;
    }>;
  }
>;

// A consumer whose tables the stage-time query does not type: the delivery read types its own,
// so the query's statement on the boxxy tables keeps one table type. No table name holds a colon,
// so the key pattern matches no real table and any consumer fits.
export type OpaqueConsumer = ConsumerDeclaration<
  string,
  Readonly<Record<`opaque:${string}`, TableDeclaration>>
>;

export type StageTimeReads = readonly [typeof boxxyWorkConsumer, ...OpaqueConsumer[]];

export interface DeliverySelectOptions {
  // at least one
  readonly pullRequests: readonly [EntityID, ...EntityID[]];

  // the environment whose deploy counts
  readonly environment: string;
  readonly target?: string | undefined;
}

// A statement that runs on the query's connection and gives raw rows. Kysely's raw SQL builder
// fits it, so this package imports no kysely.
export interface DeliveryStatement {
  readonly execute: (
    db: QueryCall<unknown, StageTimeReads>['db'],
  ) => Promise<{ readonly rows: readonly unknown[] }>;
}

// The GitHub plug-in's delivery module: the consumers that hold the delivery times, the statement
// that selects them for some pull requests, and the parse of its rows. The stage-time query finds
// the item's pull requests itself, so a deployment passes the module as the plug-in exports it.
export interface DeliveryReads {
  readonly consumers: readonly OpaqueConsumer[];
  readonly select: (options: DeliverySelectOptions) => DeliveryStatement;
  readonly parse: (rows: readonly unknown[]) => readonly DeliveryReadRow[];
}

// The consumers of the GitHub and telemetry plug-ins that the two queries read.
export interface ForeignReads {
  readonly telemetryModelRequest: TelemetryModelRequestConsumer;
  readonly telemetryTurnCost: TelemetryTurnCostConsumer;
  readonly githubPullRequest: GithubPullRequestConsumer;
  readonly delivery: DeliveryReads;
}
