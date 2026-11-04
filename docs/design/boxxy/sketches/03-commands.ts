// 03-commands.ts: the driving side. One command API that every entry point calls, with the actor
// taken from atc's sender kind.
//
// Package: @boxxy/contract (libs/contract) holds the oRPC contract the server serves and the CLI
// calls; the commands' logic is in @boxxy/dispatch. Owning docs: slice-1.md "Commands and API",
// core-model.md "Entry points", rules.md "Levers as facts".
//
// The map below is the contract's shape: one entry per procedure, with its input and output. The
// real contract is oRPC with zod schemas built from these types. `procedurePolicy` holds who may
// call each one and whether it needs a confirmation bound to the person.

import type {
  Actor,
  AskId,
  AtcSessionId,
  AttemptId,
  AttemptRow,
  ContentHash,
  CriterionId,
  DecisionId,
  EvidenceRow,
  FactId,
  GrantId,
  Instant,
  ItemId,
  ItemState,
  ItemView,
  LeverKind,
  LinkRow,
  LinkTypeName,
  Minutes,
  PhaseName,
  PipelineName,
  PoolName,
  PullRequestRef,
  PullRequestRow,
  RecipeName,
  RepoName,
  RunnerId,
  SenderKind,
} from "./00-core.ts";
import { z } from "./01-registries.ts";
import type { Schema } from "./01-registries.ts";
import type { AskAnswer } from "./02-ports.ts";
import type { Explanation } from "./04-planning.ts";
import type { CloseOutProblem } from "./06-closeouts.ts";
import type { Verdict } from "./07-measurement.ts";

// ── Call site ──────────────────────────────────────────────────────────────────────────────────
// The CLI is a thin client: `boxxy defer <item> --until <time> --reason <text>` becomes one call.

declare const client: Client;

export async function exampleDeferCallSite(item: ItemId, until: Instant) {
  await client["plan.defer"]({ item, until, reason: "waits for the release freeze to lift" });
}

/** The typed client the CLI holds: one async function per procedure. */
export type Client = { readonly [K in keyof Procedures]: (input: Procedures[K]["input"]) => Promise<Procedures[K]["output"]> };

// ── The procedures ─────────────────────────────────────────────────────────────────────────────

/** An item with everything `boxxy item show` prints. */
export type ItemDetail = {
  readonly item: ItemView;
  readonly attempts: readonly AttemptRow[];
  readonly links: readonly LinkRow[];
  readonly evidence: readonly EvidenceRow[];
  readonly pullRequests: readonly PullRequestRow[];
};

/** The session an `attempt.*` or hook call comes from. Slice 1 reads `ATC_SESSION_ID`; later the kernel-bound sender. */
export type FromSession = { readonly session: AtcSessionId };

/** A target of a lever that takes several: items in order, or every open item of a goal or project (later). */
export type LeverTargets = readonly ItemId[] | { readonly goal: ItemId } | { readonly project: ItemId };

/**
 * Every procedure on the one command API. The first block is slice 1, as slice-1.md's table lists
 * it; the second is later. Owner: slice-1.md "Commands and API", core-model.md "Entry points".
 */
export type Procedures = {
  // slice 1
  "item.file": { input: { repo: RepoName; title: string; outcome: string; acceptance: string[]; blockedBy: ItemId[] }; output: { item: ItemId } };
  "item.edit": { input: { item: ItemId; title?: string; outcome?: string; acceptance?: string[] }; output: { item: ItemId } };
  // later: input `pipeline?: PipelineName`, a per-item pipeline override. After slice 2.
  "item.get": { input: { item: ItemId }; output: ItemDetail | null };
  "item.list": { input: { state?: ItemState; repo?: RepoName }; output: ItemView[] };
  "item.close": { input: { item: ItemId; reason: string }; output: { item: ItemId } };
  "item.retry": { input: { item: ItemId }; output: { lever: number } };
  // Refuses a link of a blocking type that closes a cycle (planning.md: boxxy refuses cycles); slice 1 checks `blocks`.
  "link.add": { input: { source: ItemId; type: LinkTypeName; target: ItemId }; output: { added: true } | { added: false; reason: "cycle" | "exists" | "unknown-type" } };
  "link.remove": { input: { source: ItemId; type: LinkTypeName; target: ItemId }; output: { removed: boolean } };
  "plan.defer": { input: { item: ItemId; until?: Instant; reason: string }; output: { lever: number } };
  "plan.undefer": { input: { item: ItemId }; output: { lever: number } };
  "plan.expedite": { input: { items: ItemId[]; reason: string; expires?: Instant }; output: { levers: number[] } };
  // later: input `targets?: LeverTargets` (a goal or a project) and `anyPool?: boolean`. After slice 2.
  "plan.unexpedite": { input: { item: ItemId }; output: { lever: number } };
  "runner.status": { input: Record<string, never>; output: RunnerStatus };
  "runner.pause": { input: { runner?: RunnerId }; output: { paused: true } };
  "runner.resume": { input: { runner?: RunnerId }; output: { paused: false } };
  "attempt.current": { input: FromSession; output: { attempt: AttemptRow; item: ItemView } | null };
  "attempt.evidence": {
    input: FromSession & { kind: "test" | "ci-run" | "live-check"; ref: string; observed?: string };
    output: { factId: FactId } | { refused: "no-live-attempt" };
  };
  "attempt.closeOut": {
    input: FromSession & { closeOut: unknown }; // parsed by the phase kind's close-out parser
    output: { kind: "recorded"; factId: FactId } | { kind: "rejected"; problems: CloseOutProblem[] } | { kind: "refused"; reason: "no-live-attempt" };
  };
  "evidence.recordPr": { input: FromSession & { url: string }; output: { linked: PullRequestRef } | { linked: null; reason: "no-attempt" | "not-a-pr-url" } };

  // later
  steer: { input: { item: ItemId; note: string }; output: { deliveredTo: AttemptId | null } }; // an atc message now, the next attempt's input later
  "ask.list": { input: Record<string, never>; output: { showing: AskId | null; queued: number } };
  "ask.answer": { input: { ask: AskId; answer: AskAnswer }; output: { kind: "answered" } | { kind: "stale"; reason: "hash-mismatch" | "withdrawn" } };
  "grant.revoke": { input: { grant: GrantId }; output: { revoked: boolean } };
  "plan.rank": { input: { targets: LeverTargets; rank: number; reason: string }; output: { levers: number[] } };
  "plan.unrank": { input: { item: ItemId }; output: { lever: number } };
  "plan.pin": { input: { item: ItemId; pool: PoolName; reason: string; expires?: Instant }; output: { lever: number } }; // an override
  "plan.admit": { input: { item: ItemId; pools: PoolName[] | "any"; reason: string }; output: { lever: number } }; // an override
  "plan.lift": { input: { item: ItemId; gate: string; reason: string }; output: { lever: number } }; // an override
  "pool.hold": { input: { pool: PoolName; reason: string; until?: Instant }; output: { lever: number } };
  "pool.release": { input: { pool: PoolName }; output: { lever: number } };
  explain: {
    input: { decision: DecisionId } | { at: Instant; pool?: PoolName } | { at: Instant; item: ItemId };
    output: Explanation;
  };
  "attempt.start": { input: { item: ItemId; phase: PhaseName; recipe?: RecipeName; reason: string }; output: { attempt: AttemptId } }; // a manual attempt outside the pipeline, still recorded
  "attempt.stop": { input: { attempt: AttemptId; reason: string }; output: { stopped: boolean } };
  "item.criterion": { input: { item: ItemId; criterion: CriterionId; evidence: FactId }; output: { linked: boolean } };
  "experiment.verdict": { input: { experiment: string; at: Instant }; output: Verdict };
};

export type RunnerStatus = {
  readonly pools: readonly { readonly name: PoolName; readonly slots: number; readonly held: number }[];
  readonly running: readonly AttemptRow[];
  readonly paused: boolean;
  readonly outbox: { readonly unsent: number; readonly oldestUnsentAge: Minutes | null };
  readonly rules: { readonly version: string; readonly commit: string; readonly lastRejected: { readonly commit: string; readonly reasons: number } | null };
};

// ── Who may call what (core-model.md "Entry points") ───────────────────────────────────────────

/**
 * A procedure's policy. Slice 1 checks no caller and binds only to 127.0.0.1, so `senders` and
 * `confirm` are enforced later; the data is written now so the rule has one home.
 */
export type ProcedurePolicy = {
  readonly slice: 1 | 2 | "later";
  readonly senders: readonly SenderKind[];
  readonly confirm: "none" | "person"; // a confirmation on a channel only the person can use
};

const owner: readonly SenderKind[] = ["owner"];
const ownerOrSession: readonly SenderKind[] = ["owner", "session"];
const session: readonly SenderKind[] = ["session"];

export const procedurePolicy: { readonly [K in keyof Procedures]: ProcedurePolicy } = {
  "item.file": { slice: 1, senders: ["owner", "session", "connector"], confirm: "none" },
  "item.edit": { slice: 1, senders: ownerOrSession, confirm: "none" },
  "item.get": { slice: 1, senders: ["owner", "session", "connector", "local"], confirm: "none" },
  "item.list": { slice: 1, senders: ["owner", "session", "connector", "local"], confirm: "none" },
  "item.close": { slice: 1, senders: owner, confirm: "none" },
  "item.retry": { slice: 1, senders: owner, confirm: "none" },
  // Refuses a link of a blocking type that closes a cycle (planning.md: boxxy refuses cycles); slice 1 checks `blocks`.
  "link.add": { slice: 1, senders: ownerOrSession, confirm: "none" },
  "link.remove": { slice: 1, senders: owner, confirm: "none" },
  "plan.defer": { slice: 1, senders: ownerOrSession, confirm: "none" },
  "plan.undefer": { slice: 1, senders: ownerOrSession, confirm: "none" },
  "plan.expedite": { slice: 1, senders: owner, confirm: "person" }, // slice 1: any local program, until the confirmation lands
  "plan.unexpedite": { slice: 1, senders: owner, confirm: "none" },
  "runner.status": { slice: 1, senders: ["owner", "local"], confirm: "none" },
  "runner.pause": { slice: 1, senders: owner, confirm: "none" },
  "runner.resume": { slice: 1, senders: owner, confirm: "none" },
  "attempt.current": { slice: 1, senders: session, confirm: "none" },
  "attempt.evidence": { slice: 1, senders: session, confirm: "none" },
  "attempt.closeOut": { slice: 1, senders: session, confirm: "none" },
  "evidence.recordPr": { slice: 1, senders: session, confirm: "none" },
  steer: { slice: "later", senders: owner, confirm: "none" },
  "ask.list": { slice: "later", senders: owner, confirm: "none" },
  "ask.answer": { slice: "later", senders: owner, confirm: "person" }, // person-bound for an `always_ask`
  "grant.revoke": { slice: "later", senders: owner, confirm: "none" },
  "plan.rank": { slice: "later", senders: owner, confirm: "none" },
  "plan.unrank": { slice: "later", senders: owner, confirm: "none" },
  "plan.pin": { slice: "later", senders: ownerOrSession, confirm: "none" }, // `session`: a `plan.judge` attempt
  "plan.admit": { slice: "later", senders: ownerOrSession, confirm: "none" },
  "plan.lift": { slice: "later", senders: ownerOrSession, confirm: "none" },
  "pool.hold": { slice: "later", senders: owner, confirm: "none" },
  "pool.release": { slice: "later", senders: owner, confirm: "none" },
  explain: { slice: "later", senders: ["owner", "session", "local"], confirm: "none" },
  "attempt.start": { slice: "later", senders: owner, confirm: "none" },
  "attempt.stop": { slice: "later", senders: owner, confirm: "none" },
  "item.criterion": { slice: "later", senders: session, confirm: "none" },
  "experiment.verdict": { slice: 2, senders: ["owner", "local"], confirm: "none" },
};

// ── The actor (later; slice 1 records `boxxy:owner:local`, `boxxy:attempt:<id>` or `boxxy:hook:<id>`) ──

/** What the atc daemon tells the API about a caller. The caller can't set any of it. */
export type SenderIdentity = {
  readonly kind: SenderKind;
  readonly session: AtcSessionId | null; // set by the kernel for the `session` kind
  readonly confirmation: PersonConfirmation | null;
};

/** A confirmation bound to the person for one exact call, such as a passkey approval. */
export type PersonConfirmation = { readonly channel: string; readonly callHash: ContentHash; readonly at: Instant };

/**
 * Turns the daemon's sender into the actor every fact records, and refuses a call the policy bars.
 * A `session` sender resolves to the attempt it holds. Later. Owner: core-model.md "Entry points".
 */
export declare function resolveActor(input: {
  sender: SenderIdentity;
  procedure: keyof Procedures;
  callHash: ContentHash;
  liveAttemptFor: (session: AtcSessionId) => AttemptId | null;
}): { readonly kind: "allowed"; readonly actor: Actor } | { readonly kind: "refused"; readonly reason: "sender" | "confirmation" | "no-live-attempt" };

// ── A concept's own command (later) ────────────────────────────────────────────────────────────

/** A command a concept registers, added to the contract when the concept loads. Later. Owner: planning.md "Concepts". */
export interface CommandDecl<I = unknown> {
  name: string;
  input: Schema<I>;
  writes: readonly LeverKind[];
  policy: ProcedurePolicy;
}

/** Adding the rank command is one object in the rank concept. */
export const exampleRankCommand: CommandDecl<{ targets: LeverTargets; rank: number; reason: string }> = {
  name: "plan.rank",
  input: z.object({ targets: z.custom<LeverTargets>(), rank: z.number(), reason: z.string() }),
  writes: ["plan.rank"],
  policy: { slice: "later", senders: ["owner"], confirm: "none" },
};
