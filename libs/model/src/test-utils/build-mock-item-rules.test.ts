import { expect, test } from 'bun:test';
import { brandSchemas } from '../rows/brand-schemas.ts';
import { buildMockItemRules } from './build-mock-item-rules.ts';

test('it gives core.issue a pipeline of the build phase alone', () => {
  const rules = buildMockItemRules();
  const pipeline = rules.kinds.get(brandSchemas.itemKindName.parse('core.issue'))?.pipeline;
  const phases: unknown = pipeline?.steps.map((step) => step.phase);

  expect(phases).toStrictEqual(['build']);
});

test('it applies overrides on top of the defaults', () => {
  const rules = buildMockItemRules({ kinds: new Map() });

  expect(rules.kinds.size).toBe(0);
});
