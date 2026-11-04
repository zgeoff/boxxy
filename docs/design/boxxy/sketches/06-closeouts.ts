// 06-closeouts.ts: the typed outcome of an attempt, per phase kind, and its parser.
//
// Package: @boxxy/closeout (modules/closeout). Owning docs: close-outs.md, slice-1.md "The build
// close-out", decision 0009.
//
// A close-out holds only what the agent alone knows. Commits, PRs, CI, findings, tokens and time
// come from facts. There is no free-text `learnings` or `intent` field. An attempt whose close-out
// doesn't parse fails.

import type { AttemptId, ContentHash, CriterionId, EvidenceRow, FactId, Instant, ItemKindName, ItemView, PoolName } from "./00-core.ts";

// ── Call site ──────────────────────────────────────────────────────────────────────────────────
// `attempt.closeOut` parses the agent's JSON with the phase kind's parser, and returns every
// problem at once, so the agent fixes the close-out and sends it again.

declare const buildParser: CloseOutParser<BuildCloseOut>;

export function exampleCloseOutCallSite(raw: unknown, item: ItemView, attempt: AttemptId, evidence: readonly EvidenceRow[]) {
  const parsed = buildParser.parse(raw, { item, attempt, evidence });
  return parsed.kind === "valid" ? parsed.closeOut.result.kind : parsed.problems.length;
}

// ── The build close-out (slice 1, verbatim) ────────────────────────────────────────────────────

/** The build close-out. Slice 1. Owner: close-outs.md "The build close-out", slice-1.md. */
export type BuildCloseOut = {
  result: { kind: "built" } | { kind: "blocked"; reason: string } | { kind: "abandoned"; reason: string };
  criteria: { criterion: CriterionId; evidence: FactId }[];
  openItems: { kind: "core.issue"; title: string; body: string }[];
  friction: {
    target: { kind: "skill" | "rule" | "lint" | "agents-md" | "tool"; name: string };
    change: string;
  }[];
};

/** Work the agent found and did not do. Slice 1 files `core.issue` only; later any kind. */
export type OpenItem = { readonly kind: ItemKindName | "core.issue"; readonly title: string; readonly body: string };
/** A named change to a named target; becomes a `boxxy.proposal.recorded` fact. */
export type Friction = BuildCloseOut["friction"][number];

// ── Parsing (slice 1) ──────────────────────────────────────────────────────────────────────────

export type CloseOutContext = { readonly item: ItemView; readonly attempt: AttemptId; readonly evidence: readonly EvidenceRow[] };

/** One reason a close-out doesn't parse. The parser returns all of them. Slice 1 (build's four). */
export type CloseOutProblem =
  | { readonly kind: "schema"; readonly path: string; readonly message: string }
  | { readonly kind: "unknown-criterion"; readonly criterion: CriterionId } // not in the item's acceptance list
  | { readonly kind: "foreign-evidence"; readonly evidence: FactId } // belongs to another attempt
  | { readonly kind: "built-without-evidence"; readonly criteria: readonly CriterionId[] }
  | { readonly kind: "phase-rule"; readonly message: string }; // later: a phase kind's own constraint

export type CloseOutParse<Out> =
  | { readonly kind: "valid"; readonly closeOut: Out }
  | { readonly kind: "invalid"; readonly problems: readonly CloseOutProblem[] };

/** A phase kind's close-out parser. Pure. Slice 1 (build). Owner: close-outs.md. */
export interface CloseOutParser<Out> {
  parse(raw: unknown, ctx: CloseOutContext): CloseOutParse<Out>;
}

/** Criteria without evidence; an item is done when this is empty. Slice 1. Owner: close-outs.md "criteria". */
export declare function missingCriteria(item: ItemView, evidence: readonly EvidenceRow[], cited: BuildCloseOut["criteria"]): readonly CriterionId[];

/** Dedupe for `openItems`: a not-done item of the kind in the same repo whose title is equal after lowercasing and collapsing spaces. Slice 1. */
export declare function normaliseTitle(title: string): string;

// ── Other phase kinds (later; close-outs.md "Other phase kinds") ───────────────────────────────

/** Triage carries a typed `size`, which cohort keys and the forecast read. Later. */
export type TriageCloseOut = {
  readonly size: SizeBand;
  readonly needsDesign: boolean; // a pipeline step's `when` reads it
  readonly openItems: readonly OpenItem[];
  readonly friction: readonly Friction[];
};
export type SizeBand = "xs" | "s" | "m" | "l" | "xl";

/** Contract files a draft `core.decision` for the sign-off gate; the gate's ask binds to `draftHash`. Later. */
export type ContractCloseOut = {
  readonly draft: { readonly title: string; readonly body: string; readonly interfaces: readonly { readonly path: string; readonly hash: ContentHash }[] };
  readonly draftHash: ContentHash;
  readonly friction: readonly Friction[];
};

/** `plan.judge` must end the strand with an override or a defer. Later. Owner: planning.md "The judgement pool". */
export type JudgeCloseOut = {
  readonly end:
    | { readonly kind: "pin"; readonly pool: PoolName }
    | { readonly kind: "admit"; readonly pools: readonly PoolName[] | "any" }
    | { readonly kind: "lift"; readonly gate: string }
    | { readonly kind: "defer"; readonly until: Instant | null };
  readonly reason: string;
};

/**
 * Review: the review worker's own check result is the outcome, not an agent's report, and never a
 * count of findings. Later. Owner: merge-train.md "The merge gate".
 */
export type ReviewOutcome = {
  readonly check: "pass" | "fail";
  readonly failures: readonly ("review-call" | "unreviewed-file" | "reporter" | "marker" | "merge-resolution")[];
  readonly findings: readonly FactId[]; // each becomes a `core.finding` linked `found-in`
};

/** Every close-out an attempt row can hold. */
export type CloseOut = BuildCloseOut | TriageCloseOut | ContractCloseOut | JudgeCloseOut | ReviewOutcome;
