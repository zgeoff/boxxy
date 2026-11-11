import type { SliceOneItemView as ItemView } from '../slice-one/types.ts';
import { buildMockItemRow } from './build-mock-item-row.ts';

export function buildMockItemView(overrides: Partial<ItemView> = {}): ItemView {
  const { derived, ...row } = overrides;

  return { ...buildMockItemRow(row), derived: derived ?? { state: 'ready' } };
}
