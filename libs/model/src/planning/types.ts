import type { Schema } from '../rules/types.ts';
import type { SliceOneItemView, SliceOneLeverRow } from '../slice-one/types.ts';
import type {
  AttemptId,
  FaultRecord,
  FieldValues,
  Instant,
  ItemId,
  ItemView,
  LeverRow,
  LimitName,
  PhaseName,
  PoolName,
  RelationRow,
  RelationTypeName,
} from '../types.ts';

export type SignalName = string;

export type GateName = string;

export type WaiverName = string;

export type AdmissionName = string;

export type ViewName = string;

export type SignalKey = `${SignalName}#${string}`;

// A field name and the values that match it. An item matches when, for every field, one of its
// values is in the list.
export type Filter = Readonly<Record<string, readonly string[]>>;

export interface Limit {
  readonly name: LimitName;
  readonly max: number;
  readonly counts: Filter;
}

export interface LimitFill extends Limit {
  readonly held: number;
}

export interface Pool {
  readonly name: PoolName;
  readonly takes: Filter;

  // `lead`, then the pool's own `order`: lower first, no value last, then item id
  readonly order: readonly SignalKey[];
}

export interface Snapshot {
  readonly storeVersion: number;

  // every item not yet done and not archived, with its state and position derived at `now`
  readonly items: readonly ItemView[];
  readonly relations: readonly RelationRow[];
  readonly levers: readonly LeverRow[];
  readonly limits: readonly LimitFill[];

  // the sleeping attempts whose wake was asked for, oldest request first
  readonly wakes: readonly Wake[];
}

export interface Wake {
  readonly attempt: AttemptId;
  readonly item: ItemId;
  readonly phase: PhaseName;

  // the attempt's stored fields, which the limits are matched against again
  readonly fields: FieldValues;
  readonly requestedAt: Instant;
}

// no member stops a running attempt
export type Pick = StartPick | WakePick;

export interface StartPick {
  readonly kind: 'start';
  readonly item: ItemId;
  readonly phase: PhaseName;
  readonly round: number;
  readonly pool: PoolName;
  readonly fields: FieldValues;
  readonly limits: readonly LimitName[];
}

export interface WakePick {
  readonly kind: 'wake';
  readonly attempt: AttemptId;
  readonly limits: readonly LimitName[];
}

// An item or a wake that `decide` passed over, with the reason.
export interface Wait {
  readonly subject:
    | { readonly kind: 'item'; readonly item: ItemId }
    | { readonly kind: 'wake'; readonly attempt: AttemptId };
  readonly reason: WaitReason;
}

export type WaitReason =
  | { readonly kind: 'limit-full'; readonly limit: LimitName }
  | { readonly kind: 'no-pool' };

export interface Decision {
  // wakes first, then in pool order and by each pool's `order`
  readonly picks: readonly Pick[];
  readonly waits: readonly Wait[];
}

// One seat of a limit that an attempt holds. A fact names the seats an attempt took.
export interface SeatRef {
  readonly limit: LimitName;
}

export interface SeatTake {
  readonly limits: readonly LimitName[];
  readonly attempt: AttemptId;
  readonly holdGen: number;

  // take each seat past the limit's `max`, for a wake over the cap
  readonly overCap: boolean;
}

export interface SeatRelease {
  readonly attempt: AttemptId;
  readonly holdGen: number;
}

export interface FrameItem extends SliceOneItemView {
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

export interface PlanContext {
  now: Instant;
  levers: SliceOneLeverRow[];
  relations: RelationRow[];
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
  readonly over: RelationTypeName;
  readonly toward: 'source' | 'target';
}
