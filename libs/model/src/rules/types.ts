import type { JsonValue } from '@boxxy/content-hash';
import type { z } from 'zod';
import type {
  Admission,
  FrameItem,
  Gate,
  Pool,
  PropagationLine,
  Signal,
  SignalKey,
  SignalName,
  View,
  Waiver,
} from '../planning/types.ts';
import type {
  ConceptPin,
  ItemKindName,
  LeverKind,
  LoadedRecipe,
  MaxAttemptsByKind,
  PhaseName,
  PipelineName,
  RecipeName,
  RulesVersion,
} from '../types.ts';

export type Schema<T> = z.ZodType<T>;

export interface ParamKinds<P> {
  signal: Signal<P>;
  gate: Gate<P>;
  admission: Admission<P>;
}

export type ParamKindName = keyof ParamKinds<unknown>;

export interface Registered<K extends ParamKindName> {
  readonly kind: K;
  readonly name: string;
  open: <R>(use: <P>(plugin: ParamKinds<P>[K]) => R) => R;
}

export interface Resolved<K extends ParamKindName> {
  readonly kind: K;
  readonly name: string;

  // `signalKey(name, params)` for a signal, and the name for a gate
  readonly key: string;
  open: <R>(use: <P>(plugin: ParamKinds<P>[K], params: P) => R) => R;
}

export type ConceptName = string;

export interface Concept {
  name: ConceptName;
  version: number;
  signals?: Registered<'signal'>[];
  gates?: Registered<'gate'>[];
  waivers?: Waiver[];
  levers?: LeverKind[];
  filterFields?: FilterField[];
}

export interface FilterField {
  name: string;

  // null never matches a filter on this field
  value: (item: FrameItem) => string | readonly string[] | null;
}

export interface PlainKinds {
  waiver: Waiver;
  'filter-field': FilterField;
  lever: { readonly kind: LeverKind };
  view: View;
}

export type PluginKindName = ParamKindName | keyof PlainKinds;

export type Registry = { readonly [K in ParamKindName]: ReadonlyMap<string, Registered<K>> } & {
  readonly [K in keyof PlainKinds]: ReadonlyMap<string, PlainKinds[K]>;
} & { readonly pins: readonly ConceptPin[] };

export interface KindRules {
  readonly pipeline: Pipeline;
  readonly recipes: Readonly<Record<PhaseName, RecipeName>>;
}

export interface Pipeline {
  readonly name: PipelineName;
  readonly steps: readonly PipelineStep[];
}

export interface PipelineStep {
  readonly phase: PhaseName;

  // failed attempts before the item waits on "attempts used up"
  readonly maxAttempts: number;
}

export type ConceptEntry = `${string}@${number}`;

export type PluginRef = string | Readonly<Record<string, JsonValue>>;

export type SignalRef = SignalName | Readonly<Record<string, JsonValue>>;

export interface RulesFile {
  readonly version: 1;
  readonly concepts: readonly ConceptEntry[];
  readonly kinds: Readonly<
    Record<
      string,
      {
        readonly pipeline: readonly string[] | PipelineName;
        readonly maxAttempts: Readonly<Record<string, number>>;
        readonly recipes: Readonly<Record<string, string>>;
      }
    >
  >;
  readonly pools: readonly {
    readonly name: string;
    readonly slots: number;
    readonly takes: Readonly<Record<string, JsonValue>>;
    readonly order: readonly SignalRef[];
  }[];
  readonly lead: readonly SignalRef[];
  readonly propagation: readonly {
    readonly value: string;
    readonly over: string;
    readonly toward: 'source' | 'target';
  }[];
  readonly recipes: Readonly<
    Record<
      string,
      {
        readonly agent: string;
        readonly model: string;
        readonly effort: string;
        readonly prompt: string;
        readonly source: string;
      }
    >
  >;
}

export interface LoadedRules {
  readonly version: RulesVersion;
  readonly commit: string;
  readonly registry: Registry;
  readonly signals: ReadonlyMap<SignalKey, Resolved<'signal'>>;
  readonly gates: readonly Resolved<'gate'>[];
  readonly kinds: ReadonlyMap<ItemKindName, KindRules>;
  readonly maxAttemptsByKind: MaxAttemptsByKind;

  // in declared order, each pool's `order` starting with `lead`
  readonly pools: readonly Pool[];
  readonly propagation: readonly PropagationLine[];
  readonly recipes: ReadonlyMap<RecipeName, LoadedRecipe>;
}

export interface LoadRejection {
  readonly file: string;
  readonly path: string;
  readonly reason: LoadRejectionReason;
}

export type LoadRejectionReason =
  | { readonly kind: 'invalid'; readonly message: string }
  | { readonly kind: 'unknown-concept'; readonly ref: string }
  | { readonly kind: 'unknown-signal'; readonly signal: string }
  | {
      readonly kind: 'bad-plugin-params';
      readonly pluginKind: ParamKindName;
      readonly name: string;
      readonly message: string;
    }
  | { readonly kind: 'unknown-relation-type'; readonly relation: string }
  | { readonly kind: 'signal-without-combine'; readonly signal: string }
  | { readonly kind: 'missing-recipe'; readonly itemKind: string; readonly phase: string }
  | { readonly kind: 'missing-prompt'; readonly path: string }
  | { readonly kind: 'uncommitted-changes' };

export type LoadResult =
  | { readonly kind: 'loaded'; readonly rules: LoadedRules; readonly warnings: readonly string[] }
  | { readonly kind: 'rejected'; readonly rejections: readonly LoadRejection[] };
