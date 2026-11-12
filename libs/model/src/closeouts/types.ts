import type { JsonValue } from '@boxxy/content-hash';
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
  RelationTypeName,
  RepoName,
} from '../types.ts';

// The four close-out bodies, one per v1 phase. Every body carries `friction` and
// `frictionDropped`. The top-level keys of the four differ, so a stored close-out parses as one
// of them only.
export type CloseOut = TriageCloseOut | DesignCloseOut | BuildCloseOut | ReviewCloseOut;

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

// The review close-out as stored: the review session sends noslop's whole result, and the parser
// keeps `NoslopSummary` in its place.
export interface ReviewCloseOut {
  readonly verdict:
    | { readonly kind: 'passed' }
    | { readonly kind: 'changes-requested'; readonly findings: readonly Finding[] };
  readonly noslop: NoslopSummary;
  readonly friction: readonly Friction[];
  readonly frictionDropped: number;
}

export interface NoslopSummary {
  // the schema version of noslop's result
  readonly version: number;
  readonly reviewID: string;
  readonly head: CommitSha;
  readonly counts: {
    readonly findings: number;
    readonly failedCalls: number;
    readonly fixChecks: number;
  };

  // the UTF-8 bytes of the JSON of the parsed result, as a stored copy would take them
  readonly reportBytes: number;

  // the whole result when `reportBytes` is within the close-out limit; else null, never a part
  readonly report: JsonValue | null;
}

export interface Finding {
  readonly title: string;
  readonly body: string;
  readonly path?: string;
  readonly line?: number;
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

  // a rule of one phase kind that its schema cannot hold, such as a finding for `changes-requested`
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

// The input of a build attempt. In round 2 and later it holds the findings of the review that
// sent the item back; in round 1 it holds none.
export interface BuildInput {
  readonly acceptance: readonly CriterionText[];
  readonly design: Design | null;
  readonly findings: readonly Finding[];

  // the item's latest pull request, which a build of round 2 pushes to
  readonly pullRequest: PullRequestLink | null;
}

export interface ReviewInput {
  readonly acceptance: readonly CriterionText[];
  readonly design: Design | null;
  readonly pullRequest: PullRequestLink | null;
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
