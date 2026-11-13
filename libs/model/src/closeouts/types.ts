import type { JsonValue } from '@boxxy/content-hash';
import type { MergeOutcome } from '../merge/types.ts';
import type { GateReading, RoundCause, SeverityCounts, VerifyReading } from '../ports/types.ts';
import type {
  AttemptId,
  CommitSha,
  Criterion,
  CriterionId,
  DesignMode,
  EvidenceRow,
  FactId,
  ItemId,
  ItemKindName,
  ItemView,
  PullRequestRef,
  RelationTypeName,
  RepoName,
} from '../types.ts';

// The close-out bodies, one per phase. The top-level keys of each differ, so a stored close-out
// parses as one of them only.
export type CloseOut =
  | TriageCloseOut
  | DesignCloseOut
  | BuildCloseOut
  | ReviewCloseOut
  | VerifyCloseOut
  | MergeCloseOut;

export interface TriageCloseOut {
  readonly result:
    | { readonly kind: 'accepted' }
    | { readonly kind: 'duplicate'; readonly of: ItemId }
    | { readonly kind: 'declined'; readonly reason: string };
  readonly set?: {
    readonly kind?: ItemKindName;
    readonly designMode?: DesignMode;

    // required with `accepted` when the item has no acceptance list (`no-acceptance`)
    readonly acceptance?: readonly { readonly text: string }[];
  };
  readonly relations: readonly RelationDraft[];
  readonly friction: readonly Friction[];
  readonly frictionDropped: number;
}

export interface DesignCloseOut {
  readonly result:
    | { readonly kind: 'designed'; readonly design: Design }
    | { readonly kind: 'blocked'; readonly reason: string }
    | { readonly kind: 'abandoned'; readonly reason: string };
  readonly friction: readonly Friction[];
  readonly frictionDropped: number;
}

// The design of an item: the whole design in markdown, code blocks included. The build and the
// review get it in their input. The size of the whole close-out bounds `text`.
export interface Design {
  readonly text: string;

  // a pointer to a doc in the repo that holds the design too; null when there is none
  readonly location: string | null;
}

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

// The review close-out that holds the review gate's reading. The session sends the tool's raw
// result, and the server builds this from it with `ReviewGate.accept` before the phase kind's
// parser reads it.
export interface ReviewCloseOut {
  // null in a close-out stored before the review gate, which kept neither
  readonly round: number | null;
  readonly cause: RoundCause | null;

  // `ReviewGate.accept` matched its head to the pull request's head
  readonly reading: GateReading;

  // Every review after the first: the changed lines between the earlier review's head and this
  // head, in files outside that review's `findingPaths`. Null for the first review, and when the
  // earlier review read no head.
  readonly unrelatedLines: number | null;
}

// The verify close-out, sent by the grading agent. The parser copies `session` from the attempt's
// input, which the claim took from the recipe.
export interface VerifyCloseOut {
  readonly result:
    | { readonly kind: 'verified' }
    | { readonly kind: 'failed'; readonly features: readonly string[] }
    | { readonly kind: 'blocked'; readonly question: string }
    | { readonly kind: 'abandoned'; readonly reason: string };
  readonly session: 'builder' | 'fresh';
  readonly friction: readonly Friction[];
  readonly frictionDropped: number;
}

// The merge close-out, which the runner writes from the merge job's last step.
export interface MergeCloseOut {
  readonly outcome: MergeOutcome;
  readonly head: CommitSha;

  // the union of required checks that the job read
  readonly required: readonly string[];

  // `repair` only: the red checks, and none for a conflict
  readonly failed: readonly string[];
  readonly cause: 'conflict' | 'checks-red' | null;

  // `merged` only
  readonly mergeCommit: CommitSha | null;

  // `refused` only: the forge's text for the refusal
  readonly reason: string | null;

  // `merged`: true when boxxy's own call merged this head
  readonly byBoxxy: boolean;

  // the reading the job used, so pepys keeps the feature list
  readonly verify: VerifyReading;
}

// A relation that a close-out asks for, from the attempt's item to `target`.
export interface RelationDraft {
  readonly type: RelationTypeName;
  readonly target: ItemId;
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

// What a phase kind's settle asks for. The settle of an attempt whose outcome maps to a hold
// withholds each effect that changes an item, and keeps `record-proposal`.
export type Effect =
  | { readonly kind: 'file-item'; readonly item: OpenItem }
  | { readonly kind: 'close-item'; readonly reason: string; readonly of: ItemId | null }
  | { readonly kind: 'add-relation'; readonly relation: RelationDraft }
  | { readonly kind: 'set-kind'; readonly itemKind: ItemKindName }
  | { readonly kind: 'set-field'; readonly field: 'designMode'; readonly value: DesignMode }
  | { readonly kind: 'set-acceptance'; readonly criteria: readonly Criterion[] }
  | { readonly kind: 'record-proposal'; readonly friction: Friction };

export type CloseOutProblem =
  | { readonly kind: 'schema'; readonly path: string; readonly message: string }
  | { readonly kind: 'unknown-criterion'; readonly criterion: CriterionId }
  | { readonly kind: 'foreign-evidence'; readonly evidence: FactId }
  | { readonly kind: 'built-without-evidence'; readonly criteria: readonly CriterionId[] }
  | { readonly kind: 'no-acceptance' }
  | { readonly kind: 'unknown-item'; readonly item: string }
  | { readonly kind: 'unknown-kind'; readonly itemKind: string }
  | {
      readonly kind: 'refused-relation';
      readonly type: string;
      readonly target: string;
      readonly reason: 'unknown-type' | 'self';
    }

  // a rule of one phase kind that its schema cannot hold, such as a review with no pull request
  | { readonly kind: 'phase-rule'; readonly message: string }

  // over `closeOutBytes` as stored; `bytes` tells the agent how much to cut
  | { readonly kind: 'too-large'; readonly bytes: number; readonly max: number };

export type CloseOutParse<Body> =
  | { readonly kind: 'valid'; readonly closeOut: Body }
  | { readonly kind: 'invalid'; readonly problems: readonly CloseOutProblem[] };

export interface CloseOutParser<Body> {
  parse: (raw: unknown, ctx: CloseOutContext) => CloseOutParse<Body>;

  // the JSON Schema of the body that the agent sends, which `attempt.current` gives the session
  readonly jsonSchema: JsonValue;
}

export interface CloseOutContext {
  readonly item: ItemView;
  readonly attempt: AttemptId;

  // the attempt's own evidence rows
  readonly evidence: readonly EvidenceRow[];
  readonly world: CloseOutWorld;

  // the attempt's phase input, as its claim stored it
  readonly input: JsonValue;
}

// What a parser may check a named item, kind or relation type against.
export interface CloseOutWorld {
  // every item of the store, open or closed
  readonly items: ReadonlySet<ItemId>;
  readonly kinds: ReadonlySet<ItemKindName>;
  readonly relationTypes: ReadonlySet<RelationTypeName>;
}

export interface CriterionText {
  readonly id: CriterionId;
  readonly text: string;
}

// The input of a triage or a design attempt: the item's acceptance list, which may be empty
// before triage.
export interface AcceptanceInput {
  readonly acceptance: readonly CriterionText[];
}

// The input of a build attempt. After a review that asked for changes, `sentBack` holds that
// review's open counts and where to answer its findings; the core never reads a finding's text.
// After a failed verify, it holds the features that failed.
export interface BuildInput {
  readonly acceptance: readonly CriterionText[];
  readonly design: Design | null;
  readonly sentBack: SentBack | null;

  // the item's latest pull request, which a build of round 2 pushes to
  readonly pullRequest: PullRequestLink | null;
}

// A verify send-back's `head` is the head that the verify's input named, null when no passed
// review read one.
export type SentBack =
  | {
      readonly from: 'review';
      readonly head: CommitSha;
      readonly open: SeverityCounts;
      readonly answerHint: string;
    }
  | {
      readonly from: 'verify';
      readonly head: CommitSha | null;
      readonly features: readonly string[];
    };

// The input of a review attempt. `command` is the review gate's command line for the round. With
// no pull request, the round has nothing to review, and both are null.
export interface ReviewInput {
  readonly pullRequest: PullRequestRef | null;
  readonly round: number;
  readonly cause: RoundCause;
  readonly command: string | null;
}

// The input of a verify attempt: the item's pull request, and the head that its latest passed
// review read, null when there is none. The grader takes the features in scope from the verify
// tool, so the input holds no acceptance list. `session` is the recipe's grader.
export interface VerifyInput {
  readonly pullRequest: PullRequestLink | null;
  readonly head: CommitSha | null;
  readonly session: 'builder' | 'fresh';
}

export interface PullRequestLink {
  readonly repo: RepoName;
  readonly number: number;
  readonly url: string;
}

// What `attempt.closeOut` answers. `recorded` carries `repeat`: true when the same close-out
// arrived again. `rejected` carries every problem at once.
export type CloseOutAnswer =
  | {
      readonly kind: 'recorded';
      readonly attempt: AttemptId;
      readonly factId: FactId;
      readonly repeat: boolean;
    }
  | { readonly kind: 'rejected'; readonly problems: readonly CloseOutProblem[] }
  | {
      readonly kind: 'refused';
      readonly reason: 'no-attempt' | 'already-closed-out' | 'not-current';
    };
