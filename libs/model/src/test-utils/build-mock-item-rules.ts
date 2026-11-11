import { brandSchemas } from '../rows/brand-schemas.ts';
import type { ItemRules } from '../rules/types.ts';
import { buildMockPipeline } from './build-mock-pipeline.ts';

// `core.issue` and `core.task` run the build phase alone; no phase needs acceptance criteria.
export function buildMockItemRules(overrides: Partial<ItemRules> = {}): ItemRules {
  const pipeline = buildMockPipeline({ phases: ['build'] });

  return {
    kinds: new Map([
      [brandSchemas.itemKindName.parse('core.issue'), { pipeline }],
      [brandSchemas.itemKindName.parse('core.task'), { pipeline }],
    ]),
    phases: new Map(),
    ...overrides,
  };
}
