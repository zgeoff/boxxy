import { contentHash } from '@boxxy/content-hash';
import type { Concept, ConceptPin, JsonValue, LoadedRules } from '@boxxy/model';
import { loadRules } from '@boxxy/rules';
import invariant from 'tiny-invariant';
import { concepts as builtInConcepts } from '../concepts.ts';

interface MockRulesInput {
  readonly concepts?: readonly Concept[];
  readonly pools?: readonly JsonValue[];
  readonly lead?: readonly JsonValue[];
  readonly propagation?: readonly JsonValue[];
}

export function buildMockLoadedRules(input: MockRulesInput = {}): LoadedRules {
  const concepts = input.concepts ?? builtInConcepts;

  const file = {
    version: 1,
    concepts: concepts.map((concept) => `${concept.name}@${concept.version}`),
    kinds: {
      'core.issue': {
        pipeline: ['build'],
        maxAttempts: { build: 2 },
        recipes: { build: 'build-v1' },
      },
    },
    pools: input.pools ?? [
      {
        name: 'build',
        slots: 2,
        takes: { phase: 'build', kind: ['core.issue'] },
        order: ['oldest'],
      },
    ],
    lead: input.lead ?? ['expedite'],
    propagation: input.propagation ?? [{ value: 'expedite', over: 'blocks', toward: 'source' }],
    recipes: {
      'build-v1': {
        agent: 'claude',
        model: 'example-model',
        effort: 'high',
        prompt: 'prompts/build-v1.md',
        source: 'subscription',
      },
    },
  };

  const encoder = new TextEncoder();

  // only modules/rules may import yaml, and JSON is YAML, so the loader reads this as it is
  const rulesBytes = encoder.encode(JSON.stringify(file));

  const pins = concepts.map((concept): [string, ConceptPin] => [
    concept.name,
    {
      ref: `${concept.name}@${concept.version}`,
      sourceHash: contentHash(`${concept.name} source`),
    },
  ]);

  const result = loadRules({
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        ['rules.yaml', rulesBytes],
        ['prompts/build-v1.md', encoder.encode('Build {{title}}.\n')],
      ]),
    },
    concepts,
    pins: new Map(pins),
  });

  invariant(
    result.kind === 'loaded',
    `the mock rules file failed to load: ${JSON.stringify(result)}`,
  );

  return result.rules;
}
