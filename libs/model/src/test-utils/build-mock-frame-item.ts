import type { FrameItem } from '../planning/types.ts';
import { brandSchemas } from '../rows/brand-schemas.ts';
import { buildMockV1ItemView } from './build-mock-v1-item-view.ts';

// The item's position is the phase and round of the frame item, unless an override sets it.
export function buildMockFrameItem(overrides: Partial<FrameItem> = {}): FrameItem {
  const { phase = brandSchemas.phaseName.parse('build'), round = 1, ...view } = overrides;

  return {
    ...buildMockV1ItemView({ position: { kind: 'phase', phase, round }, ...view }),
    phase,
    round,
  };
}
