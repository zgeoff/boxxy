import type { JsonValue } from '@boxxy/content-hash';
import type { MergeOutcome, VerifyReading } from '../merge/types.ts';
import type { GateReading, RoundCause, SeverityCounts } from '../ports/types.ts';
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
  ItemShipped,
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
  | MergeCloseOut
  | LiveCloseOut;

export interface TriageCloseOut {
  readonly result:
    | { readonly kind: 'accepted' }
    | { readonly kind: 'duplicate'; readonly of: ItemId }
    | { readonly kind: 'declined'; readonly reason: string }

    // the question the owner answers before triage can decide
    | { readonly kind: 'needs-owner'; readonly question: string }

    // the parts, filed as new items in place of this one; one at least
    | { readonly kind: 'split'; readonly openItems: readonly OpenItem[] };
  readonly set?: {
    readonly kind?: ItemKindName;
    readonly designMode?: DesignMode;

    // required with `accepted` when the item has no acceptance list (`no-acceptance`)
    readonly acceptance?: readonly CriterionDraft[];

    // the whole new body, in place of the item's body
    readonly body?: string;
  };
  readonly relations: readonly RelationDraft[];
  readonly friction: readonly Friction[];
  readonly frictionDropped: number;
}

export interface DesignCloseOut {
  readonly result:
    | {
        readonly kind: 'designed';
        readonly design: Design;

        // the answers of an item that asks questions, such as an investigation, in markdown; the
        // next build gets them beside the design
        readonly conclusion?: string;
        readonly set?: {
          // the whole new list, in place of the item's list
          readonly acceptance?: readonly CriterionDraft[];
        };

        // the follow-up work the design found, filed as new items
        readonly openItems?: readonly DesignOpenItem[];
        readonly relations?: readonly RelationDraft[];
      }
    | {
        readonly kind: 'blocked';
        readonly reason: string;

        // such as a `blocks` wait on the item the design is blocked by
        readonly relations?: readonly RelationDraft[];
      }
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
  readonly relations?: readonly RelationDraft[];
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

  // null for a `blocked` merge, whose job read no head
  readonly head: CommitSha | null;

  // the union of required checks that the job read
  readonly required: readonly string[];

  // `repair` only: the red checks, and none for a conflict
  readonly failed: readonly string[];
  readonly cause: 'conflict' | 'checks-red' | null;

  // `merged` only
  readonly mergeCommit: CommitSha | null;

  // `refused`: the forge's text for the refusal; `blocked`: why the job could read no head
  readonly reason: string | null;

  // `merged`: true when boxxy's own call merged this head
  readonly byBoxxy: boolean;

  // the reading the job used, so pepys keeps the feature list; null for a `blocked` merge
  readonly verify: VerifyReading | null;

  // set on every outcome once a rule matched or the changed paths were cut short, so `item get`
  // shows why; null otherwise
  readonly signoff: {
    // the rules that matched; empty when only `truncated`
    readonly rules: readonly string[];

    // the changed paths that matched, at most 50
    readonly paths: readonly string[];
    readonly truncated: boolean;
  } | null;

  // `changes-requested` only
  readonly sentBack: { readonly head: CommitSha; readonly findings: string } | null;
}

// A relation that a close-out asks for: from the attempt's item to `target`, or from `source` to
// the attempt's item. `{ type: 'blocks', source }` makes the item wait until `source` is done.
export type RelationDraft =
  | { readonly type: RelationTypeName; readonly target: ItemId }
  | { readonly type: RelationTypeName; readonly source: ItemId };

// Work a close-out files as a new item, of any kind the rules know.
export interface OpenItem {
  readonly kind: ItemKindName;
  readonly title: string;
  readonly body: string;

  // true sets the security mark on the filed item
  readonly security?: boolean;

  // the filed item's acceptance list, numbered from `a1`; each tag is one the rules file lists
  readonly acceptance?: readonly CriterionDraft[];
}

// An open item of a design, which may set the order of the work it splits out. `blocks` and
// `blockedBy` name the designed item as `item`, and another open item of the same close-out by its
// `key`, because neither of the two has an ID yet.
export interface DesignOpenItem extends OpenItem {
  readonly key?: string;
  readonly blocks?: readonly string[];
  readonly blockedBy?: readonly string[];
}

// An end of a link between the items one settle files: the attempt's item, or the open item of
// the close-out with this key.
export type LinkEnd =
  | { readonly kind: 'item' }
  | { readonly kind: 'open-item'; readonly key: string };

// A relation between two items of one settle, at least one of them filed by it.
export interface OpenItemLink {
  readonly type: RelationTypeName;
  readonly from: LinkEnd;
  readonly to: LinkEnd;
}

export type FrictionTargetKind = 'skill' | 'rule' | 'lint' | 'agents-md' | 'tool';

export interface Friction {
  readonly target: { readonly kind: FrictionTargetKind; readonly name: string };
  readonly change: string;
}

// What a phase kind's settle asks for. The settle of an attempt whose outcome maps to a hold
// withholds each effect that changes an item, and keeps `record-proposal` and a `blocks` relation
// from another item, so the item still waits on that item after the owner's retry.
export type Effect =
  | {
      readonly kind: 'file-item';
      readonly item: OpenItem;

      // names the filed item in the `link` of an `add-relation`
      readonly key?: string;
    }
  | { readonly kind: 'close-item'; readonly reason: string; readonly of: ItemId | null }
  | { readonly kind: 'add-relation'; readonly relation: RelationDraft }
  | { readonly kind: 'add-relation'; readonly link: OpenItemLink }
  | { readonly kind: 'set-kind'; readonly itemKind: ItemKindName }
  | { readonly kind: 'set-field'; readonly field: 'designMode'; readonly value: DesignMode }
  | { readonly kind: 'set-acceptance'; readonly criteria: readonly Criterion[] }
  | { readonly kind: 'set-body'; readonly body: string }
  | { readonly kind: 'record-proposal'; readonly friction: Friction }

  // moves the pull request's row to merged and writes its `merged` fact, unless a row that is no
  // longer open shows that the pull request watch got there first
  | {
      readonly kind: 'record-merge';
      readonly pullRequest: PullRequestRef;
      readonly mergeCommit: CommitSha | null;
    };

export type CloseOutProblem =
  | { readonly kind: 'schema'; readonly path: string; readonly message: string }
  | { readonly kind: 'unknown-criterion'; readonly criterion: CriterionId }
  | { readonly kind: 'foreign-evidence'; readonly evidence: FactId }
  | { readonly kind: 'built-without-evidence'; readonly criteria: readonly CriterionId[] }
  | { readonly kind: 'no-acceptance' }

  // a cited `check` or `verdict` recorded at another head than the pull request's; the agent
  // records it again at `head`. `head` is null when there is no open pull request, and `cause`
  // then says why; `cause` is null when `head` is set.
  | {
      readonly kind: 'stale-evidence';
      readonly criterion: CriterionId;
      readonly evidence: FactId;
      readonly recordedAt: CommitSha;
      readonly head: CommitSha | null;
      readonly cause: NoHeadCause | null;
    }
  | { readonly kind: 'unknown-item'; readonly item: string }
  | { readonly kind: 'unknown-kind'; readonly itemKind: string }
  | { readonly kind: 'unknown-criterion-tag'; readonly tag: string }
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

// why a close-out has no open pull request to read a head from
export type NoHeadCause = 'no-forge' | 'no-pull-request' | 'closed' | 'not-found';

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

  // The open pull request's head. Only a `built` build close-out that cites a `check` or a
  // `verdict` gets it, because no other close-out reads it; for every other close-out it is null.
  readonly head: CommitSha | null;

  // Why `head` is null for a close-out that cites checked evidence; absent reads as `closed`.
  readonly noHeadCause?: NoHeadCause;
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

  // the tags that the rules file lists for an acceptance line
  readonly criterionTags: ReadonlySet<string>;
}

// One line of an acceptance list that a close-out sets
export interface CriterionDraft {
  readonly text: string;
  readonly tags?: readonly string[];
}

export interface CriterionText {
  readonly id: CriterionId;
  readonly text: string;
  readonly tags?: readonly string[];
}

// The input of a triage or a design attempt: the item's acceptance list, which may be empty, and
// where the last attempt of the phase stopped.
export interface AcceptanceInput {
  readonly acceptance: readonly CriterionText[];

  // the reason, or the triage question, of the item's latest attempt of the phase that closed
  // out, when it closed out `blocked` or `needs-owner`; null otherwise
  readonly stopped: string | null;
}

// The input of a build attempt. After a review that asked for changes, `sentBack` holds that
// review's open counts and where to answer its findings; the core never reads a finding's text.
// After a failed verify, it holds the features that failed.
export interface BuildInput {
  readonly acceptance: readonly CriterionText[];
  readonly design: Design | null;

  // the conclusion of the latest design, null when it has none
  readonly conclusion: string | null;
  readonly sentBack: SentBack | null;

  // the reason of the item's latest build that closed out, when it closed out `blocked`
  readonly stopped: string | null;

  // the item's latest pull request, which a build of round 2 pushes to
  readonly pullRequest: PullRequestLink | null;
}

// A verify send-back's `head` is the head that the verify's input named, null when no passed
// review read one. The owner's send-back carries the findings the owner wrote, whole, and the head
// the owner read.
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
    }
  | {
      readonly from: 'owner';
      readonly head: CommitSha;
      readonly findings: string;
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

// The input of a merge attempt: the item's latest pull request, null when it has none.
export interface MergeInput {
  readonly pullRequest: PullRequestLink | null;
}

// The input of a live attempt: the item's merged pull request and commit, the ship watch's row for
// that commit, and the item's lines that the step's `criteria.tagged` matches. Each of the first
// three is null when the item has none, which a step that waits on `shipped` never claims.
export interface LiveInput {
  readonly pullRequest: PullRequestLink | null;
  readonly commit: CommitSha | null;
  readonly shipped: ItemShipped | null;
  readonly criteria: readonly CriterionText[];
}

// The live close-out, sent by the checking agent. `confirmed` and `broken` checked the lines;
// `blocked` and `abandoned` did not.
export type LiveCloseOut =
  | { readonly outcome: 'confirmed'; readonly lines: readonly LineResult[] }
  | { readonly outcome: 'broken'; readonly lines: readonly LineResult[]; readonly bug: LiveBug }

  // the question for the owner
  | { readonly outcome: 'blocked'; readonly reason: string }
  | { readonly outcome: 'abandoned'; readonly reason: string };

// Filed through the `file-item` effect, with a `relates-to` link to the checked item. The parser
// refuses a kind other than `bug`.
export interface LiveBug extends OpenItem {
  readonly kind: ItemKindName;

  // the failing lines, tags kept
  readonly acceptance: readonly CriterionDraft[];
}

export interface LineResult {
  readonly criterionId: CriterionId;
  readonly passed: boolean;

  // stays in the item and the close-out: never posted to the pull request
  readonly evidence: string;
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
    }

  // the head read failed; nothing settled, and the agent sends the close-out again
  | { readonly kind: 'retry' };
