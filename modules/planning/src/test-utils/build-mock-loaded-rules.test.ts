import { expect, test } from 'bun:test';
import { signalKey } from '@boxxy/model';
import { buildMockLoadedRules } from './build-mock-loaded-rules.ts';

test('it loads one build pool over the built-in concepts, led by expedite', () => {
  const rules = buildMockLoadedRules();

  const loaded: unknown = {
    pools: rules.pools,
    propagation: rules.propagation,
    gates: rules.gates.map((gate) => gate.name),
  };

  expect(loaded).toStrictEqual({
    pools: [
      {
        name: 'build',
        slots: 2,
        takes: { phase: ['build'], kind: ['core.issue'] },
        order: [signalKey('expedite', {}), signalKey('oldest', {})],
      },
    ],
    propagation: [{ value: 'expedite', over: 'blocks', toward: 'source' }],
    gates: ['defer'],
  });
});

test('it applies the pools, lead and propagation overrides', () => {
  const rules = buildMockLoadedRules({
    pools: [{ name: 'docs', slots: 1, takes: { repo: 'acme/docs' }, order: [] }],
    lead: [],
    propagation: [],
  });

  const loaded: unknown = { pools: rules.pools, propagation: rules.propagation };

  expect(loaded).toStrictEqual({
    pools: [{ name: 'docs', slots: 1, takes: { repo: ['acme/docs'] }, order: [] }],
    propagation: [],
  });
});
