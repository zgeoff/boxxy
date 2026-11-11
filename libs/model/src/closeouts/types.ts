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
    | { readonly kind: 'designed'; readonly design: DesignRef }
    | { readonly kind: 'blocked'; readonly reason: string }
    | { readonly kind: 'abandoned'; readonly reason: string };
  readonly friction: readonly Friction[];
  readonly frictionDropped: number;
}

// Where the design of an item is, and what it says in short. The build and the review get it in
// their input.
export interface DesignRef {
  readonly summary: string;

  // a URL or a repo path of the whole design; null when the summary is the whole design
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

// A finding is a type alias, not an interface, so that a phase input that holds findings is a
// `JsonValue`: an interface has no implicit index signature.
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

// The input of a build attempt. In round 2 and later it holds the findings of the review that
// sent the item back; in round 1 it holds none.
export interface BuildInput {
  readonly acceptance: readonly CriterionText[];
  readonly design: { readonly summary: string; readonly location: string | null } | null;
  readonly findings: readonly Finding[];
}

export interface ReviewInput {
  readonly acceptance: readonly CriterionText[];
  readonly design: { readonly summary: string; readonly location: string | null } | null;
  readonly pullRequest: {
    readonly repo: RepoName;
    readonly number: number;
    readonly url: string;
  } | null;
}
