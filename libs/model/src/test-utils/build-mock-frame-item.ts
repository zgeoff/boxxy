import { brandSchemas } from '../brand-schemas.ts';
import type { FrameItem } from '../types/planning.ts';
import { buildMockItemView } from './build-mock-item-view.ts';

export function buildMockFrameItem(overrides: Partial<FrameItem> = {}): FrameItem {
  const { phase, ...view } = overrides;

  return { ...buildMockItemView(view), phase: phase ?? brandSchemas.phaseName.parse('build') };
}
