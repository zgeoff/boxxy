import { contentHash } from '@boxxy/content-hash';
import type { PoolName, Snapshot, SnapshotHash } from '@boxxy/model';
import { brandSchemas, toJSONValue } from '@boxxy/model';

// The hash covers the pools in backoff too: they decide the picks as much as the rows do, and
// the runner keeps them in memory only.
export function buildSnapshotHash(snapshot: Snapshot, backoff: readonly PoolName[]): SnapshotHash {
  return brandSchemas.snapshotHash.parse(contentHash(toJSONValue({ snapshot, backoff })));
}
