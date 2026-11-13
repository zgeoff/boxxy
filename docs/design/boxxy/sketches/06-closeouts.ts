// 06-closeouts.ts: the typed outcome of an attempt, per phase kind, and its parser.
//
// Package: @boxxy/closeout (modules/closeout) holds the parsers, `missingCriteria` and
// `dedupeOpenItems`. Every type here, the build close-out's shape in 00-core.ts, and its zod schema
// live in @boxxy/model, because dispatch, the contract and the rules' phase kinds use them. Owning docs:
// close-outs.md, slice-1.md "The build close-out", decision 0009.
//
// A close-out holds only what the agent alone knows. Commits, PRs, CI, findings, tokens and time
// come from facts. There is no free-text `learnings` or `intent` field. An attempt whose close-out
// doesn't parse fails.

import type { AttemptId, BuildCloseOut, ContentHash, CriterionId, EvidenceRow, FactId, Friction, Instant, ItemId, ItemView, OpenItem, OpenItemLater, PoolName } from "./00-core.ts";

// ── Call site ──────────────────────────────────────────────────────────────────────────────────
// `attempt.closeOut` parses the agent's JSON with the phase kind's parser, and returns every
// problem at once, so the agent fixes the close-out and sends it again.

export function exampleCloseOutCallSite(raw: unknown, item: ItemView, attempt: AttemptId, evidence: readonly EvidenceRow[]) {
  const parsed = buildCloseOutParser.parse(raw, { item, attempt, evidence });
  return parsed.kind === "valid" ? parsed.closeOut.result.kind : parsed.problems.length;
}

// The build close-out's shape (`BuildCloseOut`, `OpenItem`, `Friction`) is in 00-core.ts.

// ── Parsing (slice 1) ──────────────────────────────────────────────────────────────────────────

/** `evidence`: the attempt's own evidence rows. A cited id outside them is `foreign-evidence`. */
export type CloseOutContext = { readonly item: ItemView; readonly attempt: AttemptId; readonly evidence: readonly EvidenceRow[] };

/** One reason a close-out doesn't parse. The parser returns all of them. Slice 1 (build's four). */
export type CloseOutProblem =
  | { readonly kind: "schema"; readonly path: string; readonly message: string } // path as the loader writes it, such as `friction[0].target.kind`
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

/** The build close-out's parser. Slice 1. */
export declare const buildCloseOutParser: CloseOutParser<BuildCloseOut>;

/** Criteria the close-out cites no evidence for; a `built` result with any fails the parse. Slice 1. Owner: close-outs.md "criteria". */
export declare function missingCriteria(item: ItemView, evidence: readonly EvidenceRow[], cited: BuildCloseOut["criteria"]): readonly CriterionId[];

/**
 * Dedupe for `openItems`. An entry matches an open item of the same repo and kind whose title is
 * equal after `normaliseTitle`; slice 1 filed `core.issue` only. A match files nothing, and settle lists the matched item in the attempt's
 * `boxxy.attempt.settled` fact. Settle reads `open` through the store and passes it in. Slice 1.
 * Owner: slice-1.md "The build close-out".
 */
export declare function dedupeOpenItems(entries: readonly OpenItem[], open: readonly ItemView[]): { readonly file: readonly OpenItem[]; readonly matched: readonly ItemId[] };

/** Lowercases, trims, and collapses each run of whitespace to one space. Slice 1. */
export declare function normaliseTitle(title: string): string;

// ── Other phase kinds (later; close-outs.md "Other phase kinds") ───────────────────────────────

/** Triage carries a typed `size`, which cohort keys and the forecast read. Later. */
export type TriageCloseOut = {
  readonly size: SizeBand;
  readonly needsDesign: boolean; // a pipeline step's `when` reads it
  readonly openItems: readonly OpenItemLater[];
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
