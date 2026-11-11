import type { ItemId, KeptSession, RowWrite } from '@boxxy/model';

// The write that clears the item's kept session, guarded by the value it was read as.
export function buildKeptClear(item: ItemId, kept: KeptSession): RowWrite {
  return {
    op: 'update',
    table: 'items',
    key: { id: item },
    expect: { keptSession: kept },
    set: { keptSession: null },
  };
}
