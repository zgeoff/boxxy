// 09-merge-train.ts: the merge gate, units (a PR or a stack), the train's queue per repo, the
// batch-size rule plug-in, the conflict probe, rerun and quarantine, and the fix-attempt limit.
//
// Package: @boxxy/train (modules/train), later; the forge calls extend `forge-github`. Owning
// docs: merge-train.md, decisions 0010 and 0011.
//
// The train's logic is a pure step over its state and one event, returning commands the runner
// carries out through the forge. Every rebase at the front writes a conflict fact.

import type { AttemptId, CommitSha, Instant, PullRequestRef, RepoName } from "./00-core.ts";
import type { PluginRef, Schema } from "./01-registries.ts";
import { defineBatchSizeRule, z } from "./01-registries.ts";
import type { Forge } from "./02-ports.ts";

// ── Call site ──────────────────────────────────────────────────────────────────────────────────
// The runner feeds each forge event to the pure step and carries out what it returns.

export function exampleTrainCallSite(state: TrainState, event: TrainEvent, rules: TrainRules): readonly TrainCommand[] {
  return trainStep(state, event, rules).commands;
}

// ── The merge gate (later; merge-train.md "The merge gate") ────────────────────────────────────

/**
 * A unit is ready when its head has green required CI and a passing review check. The gate reads
 * the review worker's check result, never a count of findings; a clean rebase keeps the review,
 * because the reviewer keys each file on a patch id. Both are the review worker kind's contract.
 */
export type MergeGateReading = {
  readonly head: CommitSha;
  readonly requiredCi: "green" | "red" | "pending";
  readonly reviewCheck: "pass" | "fail" | "pending";
};

// ── Units and the queue ────────────────────────────────────────────────────────────────────────

/** One PR, or a stack: PRs whose base is another open PR's head. A stack rebases, runs CI and merges as one. Later. */
export type TrainUnit = {
  readonly repo: RepoName;
  readonly prs: readonly PullRequestRef[]; // base first
  readonly head: CommitSha;
  readonly fixAttempts: number; // agent fixes so far; at the limit the unit escalates to the owner
};

export type TrainState = {
  readonly repo: RepoName;
  readonly base: CommitSha;
  readonly queue: readonly TrainUnit[]; // ready units, front first
  readonly inFlight: { readonly batch: readonly TrainUnit[]; readonly combinedHead: CommitSha } | null;
  readonly fixing: readonly TrainUnit[]; // out of the batch until their fix lands; the train never waits
  readonly quarantined: readonly string[]; // tests quarantined for the train
};

export type TrainEvent =
  | { readonly kind: "unit-ready"; readonly unit: TrainUnit }
  | { readonly kind: "base-moved"; readonly base: CommitSha }
  | { readonly kind: "probe-result"; readonly unit: TrainUnit; readonly result: ProbeResult }
  | { readonly kind: "rebase-result"; readonly unit: TrainUnit; readonly result: ConflictResult }
  | { readonly kind: "ci-result"; readonly head: CommitSha; readonly result: "green" | { readonly red: readonly string[] } }
  | { readonly kind: "rerun-result"; readonly head: CommitSha; readonly stillFailing: readonly string[]; readonly passedOnRerun: readonly string[] }
  | { readonly kind: "fix-settled"; readonly unit: TrainUnit; readonly attempt: AttemptId; readonly fixed: boolean };

export type TrainCommand =
  | { readonly kind: "probe"; readonly units: readonly TrainUnit[] } // trial-rebase every open unit; no push, no CI
  | { readonly kind: "rebase"; readonly unit: TrainUnit } // only at the front
  | { readonly kind: "run-ci"; readonly batch: readonly TrainUnit[] } // on the combined head
  | { readonly kind: "rerun-failed"; readonly head: CommitSha; readonly tests: readonly string[] } // same head, failed tests only
  | { readonly kind: "quarantine"; readonly test: string; readonly fileItem: true } // fails then passes: quarantine and file an item
  | { readonly kind: "bisect"; readonly batch: readonly TrainUnit[] } // eject the failing unit, requeue the rest
  | { readonly kind: "merge"; readonly batch: readonly TrainUnit[] }
  | { readonly kind: "start-fix"; readonly unit: TrainUnit; readonly reason: "conflict" | "ci" } // a triggered phase: script first, agent on failure
  | { readonly kind: "escalate"; readonly unit: TrainUnit }; // after the fix-attempt limit: an owner ask

/** The train's pure step. Later. */
export declare function trainStep(state: TrainState, event: TrainEvent, rules: TrainRules): { readonly state: TrainState; readonly commands: readonly TrainCommand[]; readonly facts: readonly TrainFact[] };

// ── Rules ──────────────────────────────────────────────────────────────────────────────────────

/** The train's rules lines. Later. */
export type TrainRules = {
  readonly batchSize: PluginRef; // a batch-size plug-in by name, with its parameters
  readonly maxFixAttempts: number; // 3
  readonly rerunBeforeBisect: true; // fixed by decision 0011
};

/** The failure rate per unit on combined batches, per repo, counting only failures that survive the rerun. */
export type FailureRate = { readonly repo: RepoName; readonly perUnit: number; readonly batches: number; readonly since: Instant };

/** Sets the batch cap from the measured failure rate. Later. Owner: merge-train.md "The batch size". */
export interface BatchSizeRule<P> {
  name: string;
  params: Schema<P>;
  cap(rate: FailureRate, params: P): number;
}

/** The provisional bands: 6 at 5% or less, 3 near 10%, near serial above 20%, never over `max`. */
export const exampleBandedBatchSize = defineBatchSizeRule({
  name: "banded",
  params: z.object({ max: z.number() }),
  cap: (rate, p) => Math.min(p.max, rate.perUnit <= 0.05 ? 6 : rate.perUnit <= 0.12 ? 3 : rate.perUnit <= 0.2 ? 2 : 1),
});

// ── Facts (later) ──────────────────────────────────────────────────────────────────────────────

export type ProbeResult = { readonly kind: "clean" } | { readonly kind: "conflict"; readonly files: readonly string[] };
/** The conflict fact every rebase at the front writes: result, files and cost. Decision 0010. */
export type ConflictResult = "clean" | "retry" | "agent" | "failed";

export type TrainFacts = {
  "boxxy.train.conflict": { readonly repo: RepoName; readonly unit: readonly PullRequestRef[]; readonly result: ConflictResult; readonly files: readonly string[]; readonly costMinutes: number };
  "boxxy.train.quarantined": { readonly repo: RepoName; readonly test: string; readonly head: CommitSha };
  "boxxy.train.flake_alarm": { readonly repo: RepoName; readonly kind: "innocent-ejection" | "all-pass-bisect"; readonly head: CommitSha };
  "boxxy.train.merged": { readonly repo: RepoName; readonly batch: readonly PullRequestRef[]; readonly head: CommitSha };
};
export type TrainFact = { readonly [T in keyof TrainFacts]: { readonly type: T; readonly payload: TrainFacts[T] } }[keyof TrainFacts];

// ── The train's forge (later; extends slice 1's Forge) ─────────────────────────────────────────

/** What the train needs beyond reading PRs. `forge-github` implements it. Later. */
export interface TrainForge extends Forge {
  readGate(unit: TrainUnit): Promise<MergeGateReading>;
  trialRebase(unit: TrainUnit, onto: CommitSha): Promise<ProbeResult>; // no push, no CI
  rebase(unit: TrainUnit, onto: CommitSha): Promise<{ readonly kind: "pushed"; readonly head: CommitSha } | ProbeResult>;
  runCombined(batch: readonly TrainUnit[], base: CommitSha): Promise<{ readonly head: CommitSha }>;
  rerunFailed(head: CommitSha, tests: readonly string[]): Promise<void>;
  merge(batch: readonly TrainUnit[], head: CommitSha): Promise<"merged" | { readonly kind: "refused"; readonly reason: string }>;
}
