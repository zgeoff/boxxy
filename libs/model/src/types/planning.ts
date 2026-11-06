import type {
  FaultRecord,
  Instant,
  ItemId,
  ItemView,
  LeverRow,
  LinkRow,
  LinkTypeName,
  PhaseName,
  PoolName,
} from './core.ts';
import type { Schema } from './registries.ts';

export type SignalName = string;

export type GateName = string;

export type WaiverName = string;

export type AdmissionName = string;

export type ViewName = string;

export type SignalKey = `${SignalName}#${string}`;

export interface Snapshot {
  storeVersion: number;

  // every item not yet done and not archived, with its state derived at the read's `now`
  items: ItemView[];
  links: LinkRow[];
  levers: LeverRow[];
  freeSlots: Record<PoolName, number>;
}

export interface FrameItem extends ItemView {
  readonly phase: PhaseName;
}

export interface Frame {
  // the open items in state `ready`, the only items decide picks
  candidates: FrameItem[];
  fields: Map<ItemId, Readonly<Record<string, readonly string[]>>>;
  values: Map<SignalKey, Map<ItemId, number>>;
  holds: Map<ItemId, Hold[]>;
  lifted: Map<ItemId, Lift[]>;
  faults: Fault[];
}

export type FrameValues = ReadonlyMap<SignalKey, ReadonlyMap<ItemId, number>>;

export interface Hold {
  readonly gate: GateName;
  readonly reason: string;
  readonly until?: Instant;
}

export interface Lift {
  readonly waiver: WaiverName;
  readonly gate: GateName;
  readonly reason: string;
}

export type Fault = FaultRecord;

export interface Decision {
  // in pool order, then by each pool's `order`
  picks: Pick[];
}

export interface Pick {
  item: ItemId;
  phase: PhaseName;
  pool: PoolName;
}

export interface Pool {
  readonly name: PoolName;
  readonly slots: number;
  readonly takes: Readonly<Record<string, readonly string[]>>;

  // `lead`, then the pool's own `order`: lower first, no value last, then item id
  readonly order: readonly SignalKey[];
}

export interface PlanContext {
  now: Instant;
  levers: LeverRow[];
  links: LinkRow[];
  values: FrameValues;
}

export interface Signal<P> {
  name: SignalName;
  params: Schema<P>;

  // null is no opinion
  value: (item: FrameItem, ctx: PlanContext, params: P) => number | null;
  combine?: (left: number, right: number) => number;
}

export interface Gate<P> {
  name: GateName;
  liftable: boolean;
  params: Schema<P>;
  hold: (item: FrameItem, ctx: PlanContext, params: P) => Hold | null;
}

export interface Waiver {
  name: WaiverName;
  lifts: GateName;
  lift: (item: FrameItem, hold: Hold, ctx: PlanContext) => Lift | null;
}

export interface Admission<P> {
  name: AdmissionName;
  params: Schema<P>;
  admit: (item: FrameItem, ctx: PlanContext, params: P) => AdmissionGrant | null;
}

export interface AdmissionGrant {
  readonly admission: AdmissionName;
  readonly pools: readonly PoolName[] | 'any';
  readonly reason: string;
}

export interface View<I = unknown, O = unknown> {
  name: ViewName;
  render: (frame: Frame, input: I) => O;
}

export interface PropagationLine {
  readonly value: SignalName;
  readonly over: LinkTypeName;
  readonly toward: 'source' | 'target';
}
