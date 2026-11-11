import type { FrameItem } from '../planning/types.ts';
import { brandSchemas } from '../rows/brand-schemas.ts';
import { buildMockItemView } from './build-mock-item-view.ts';

export function buildMockFrameItem(overrides: Partial<FrameItem> = {}): FrameItem {
  const { phase, ...view } = overrides;

  return { ...buildMockItemView(view), phase: phase ?? brandSchemas.phaseName.parse('build') };
}
