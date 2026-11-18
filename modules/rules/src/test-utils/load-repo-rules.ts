import type { JsonValue, LoadResult, SpawnScope } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { buildMockPhaseKind } from '@boxxy/model/test-utils/build-mock-phase-kind';
import { loadRules } from '../loading/load-rules.ts';

interface RepoRulesInput {
  // the `repos` section, as the rules file writes it
  readonly repos: JsonValue;

  // the steps of the `standard` pipeline; build then review when left out
  readonly steps?: readonly JsonValue[];

  // the recipes of the `core.issue` kind; the `plain` recipe for build and review when left out
  readonly kindRecipes?: Readonly<Record<string, string>>;

  // more entries of the `recipes` section, beside `plain`, `scoped` and `plain-builder`
  readonly recipes?: Readonly<Record<string, JsonValue>>;
  readonly spawn?: SpawnScope;
}

const baseRecipe = {
  agent: 'claude',
  model: 'example-model',
  effort: 'high',
  prompt: 'prompts/p.md',
  source: 'subscription',
  skills: [],
};

// A build and review pipeline through the real loader. `scoped` runs on the agent `scoped-agent`,
// and `plain-builder` wakes the build's kept session.
export function loadRepoRules(input: RepoRulesInput): LoadResult {
  const encoder = new TextEncoder();

  const file = {
    version: 1,
    concepts: [],
    repos: input.repos,
    pipelines: {
      standard: input.steps ?? [
        { phase: 'build', maxAttempts: 2, timeoutMinutes: 60, on: { built: 'next' } },
        {
          phase: 'review',
          maxAttempts: 2,
          timeoutMinutes: 60,
          on: { passed: { end: 'reviewed' }, failed: { hold: 'blocked' } },
        },
      ],
    },
    kinds: {
      'core.issue': {
        pipeline: 'standard',
        recipes: input.kindRecipes ?? { build: 'plain', review: 'plain' },
      },
    },
    relationTypes: ['blocks'],
    limits: [{ name: 'workers', max: 7, counts: {} }],
    pools: [],
    recipes: {
      plain: baseRecipe,
      scoped: { ...baseRecipe, agent: 'scoped-agent' },
      'plain-builder': { ...baseRecipe, session: 'builder' },
      ...input.recipes,
    },
    sleep: { afterIdleMinutes: 30, afterQuietMinutes: 60, afterUnattendedMinutes: 240 },
  };

  const rulesBytes = encoder.encode(JSON.stringify(file));
  const promptBytes = encoder.encode('Do {{title}}.\n');

  return loadRules({
    workers: [brandSchemas.workerKindName.parse('atc.session')],
    ...(input.spawn === undefined ? {} : { spawn: input.spawn }),
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        ['rules.yaml', rulesBytes],
        ['prompts/p.md', promptBytes],
      ]),
    },
    concepts: [],
    pins: new Map(),
    phases: [
      buildMockPhaseKind({ name: 'build', outcomes: ['built'] }),
      buildMockPhaseKind({ name: 'review', outcomes: ['passed', 'failed'] }),
    ],
  });
}
