import type { JsonValue } from '@boxxy/content-hash';
import type { AttemptId, CommitSha, PullRequestRef } from '../types.ts';

// Why a review round runs. The core picks it from the item's settled attempts; the adapter maps it
// to its own calls. `recheck`: after a repair, a moved head, a failed verify or a failed review.
export type RoundCause = 'first' | 'rework' | 'recheck';

export interface GateRound {
  // the review attempt
  readonly attempt: AttemptId;
  readonly pullRequest: PullRequestRef;

  // 1 to 4; the core counts it, never the adapter
  readonly round: number;
  readonly cause: RoundCause;
}

// The review port. The review runs in an agent session on an agent host; the server only checks
// and posts its result.
export interface ReviewGate {
  // pure: the command line that the review session runs in its clone of the pull request's repo
  buildCommand: (round: GateRound) => string;

  // Checks the session's result against the pull request's current head, posts it, and reads
  // each finding's state. Throws only when the forge gives no answer, so the session sends again.
  // A forge that refuses the read or the post gives a `not-covered` reading with its reason.
  accept: (round: GateRound, result: JsonValue) => Promise<GateReading>;
}

// `not-covered`: the result is for another head than the pull request's current head, it read no
// part of that head, or the forge refused the gate's read or post, which `reason` then states. A
// tool check that passes at a head no review read is never `passed`.
export type GateReading =
  | ({ readonly status: 'passed' } & GateRun)
  | ({
      readonly status: 'blocked';
      readonly why: 'open-findings' | 'failed-call' | 'unreadable';
    } & GateRun)
  | {
      readonly status: 'not-covered';
      readonly head: CommitSha;
      readonly cost: GateCost;
      readonly reason?: string;
    };

export interface GateRun {
  readonly head: CommitSha;

  // the findings still open at `head`, whatever round raised them
  readonly open: SeverityCounts;

  // findings closed by an answer that is not a confirmed fix
  readonly closedWithoutFix: number;

  // the files of the findings still open at `head`
  readonly findingPaths: readonly string[];
  readonly cost: GateCost;

  // the tool's own ID of the run, for the owner to look up
  readonly ref: string;

  // text for the builder's input: where the findings are and how to answer them
  readonly answerHint: string;
}

export interface SeverityCounts {
  readonly high: number;
  readonly medium: number;
  readonly low: number;
}

// Tokens per model, as the tool reports them. boxxy stores no money; pepys prices the tokens.
export interface GateCost {
  readonly calls: readonly GateCall[];
}

export interface GateCall {
  readonly model: string;
  readonly input: number;
  readonly cachedInput: number;
  readonly cacheWrite: number;
  readonly output: number;
  readonly durationMs: number;
}
