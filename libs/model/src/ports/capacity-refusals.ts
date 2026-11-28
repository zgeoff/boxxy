import type {
  AttemptId,
  CapacityRefusalId,
  Instant,
  ItemId,
  PhaseName,
  PoolName,
  RefusalDetail,
} from '../types.ts';

// One spawn that atc refused for capacity. The refused attempt is deleted in the same change, so
// `attempt` names no stored row; it is the ID that the `settled` fact for the refusal carries.
export interface CapacityRefusalRow {
  readonly id: CapacityRefusalId;
  readonly attempt: AttemptId;
  readonly item: ItemId;
  readonly phase: PhaseName;
  readonly pool: PoolName;
  readonly at: Instant;

  // null when atc gave no answer, such as a refusal that the worker made before it called atc
  readonly refusal: RefusalDetail | null;
}

// The spawns that atc refused for capacity, counted back to the latest attempt that started a
// session.
export interface CapacityRefusals {
  // null when atc refused no spawn for capacity; `refusal` is null when atc gave no answer
  readonly latest: {
    readonly attempt: AttemptId;
    readonly at: Instant;
    readonly refusal: RefusalDetail | null;
  } | null;
  readonly count: number;
}
