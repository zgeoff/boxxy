import type { JsonValue, LoadedRules } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { buildMockPhaseKind } from '@boxxy/model/test-utils/build-mock-phase-kind';
import invariant from 'tiny-invariant';
import { loadRules } from '../loading/load-rules.ts';

interface MockRulesInput {
  // the steps of the `standard` pipeline, as the rules file writes them
  readonly steps: readonly JsonValue[];

  // the item kinds and the pipeline name each uses; one `core.issue` kind on `standard` when left out
  readonly kinds?: Readonly<Record<string, string>>;
}

const phaseOutcomes: Readonly<Record<string, readonly string[]>> = {
  triage: ['accepted', 'duplicate', 'declined'],
  build: ['built', 'blocked', 'abandoned'],
  review: ['passed', 'changes-requested'],
};

// A rules file with the three phases triage, build and review, loaded through the real loader
export function loadMockRules(input: MockRulesInput): LoadedRules {
  const recipes = Object.fromEntries(
    Object.keys(phaseOutcomes).map((phase) => [phase, `${phase}-v1`]),
  );

  const file = {
    version: 1,
    concepts: [],
    pipelines: { standard: input.steps },
    kinds: Object.fromEntries(
      Object.entries(input.kinds ?? { 'core.issue': 'standard' }).map(([kind, pipeline]) => [
        kind,
        { pipeline, recipes },
      ]),
    ),
    relationTypes: ['blocks'],
    limits: [{ name: 'workers', max: 7, counts: {} }],
    pools: [],
    recipes: Object.fromEntries(
      Object.keys(phaseOutcomes).map((phase) => [
        `${phase}-v1`,
        {
          agent: 'claude',
          model: 'example-model',
          effort: 'high',
          prompt: `prompts/${phase}-v1.md`,
          source: 'subscription',
          skills: [],
        },
      ]),
    ),
    sleep: { afterIdleMinutes: 30, afterQuietMinutes: 60, afterUnattendedMinutes: 240 },
  };

  const encoder = new TextEncoder();

  const phases = Object.entries(phaseOutcomes).map(([name, outcomes]) =>
    buildMockPhaseKind({ name, outcomes }),
  );

  const promptFiles = Object.keys(phaseOutcomes).map((phase): [string, Uint8Array] => [
    `prompts/${phase}-v1.md`,
    encoder.encode(`Do the ${phase} of {{title}}.\n`),
  ]);

  const rulesFile: [string, Uint8Array] = ['rules.yaml', encoder.encode(JSON.stringify(file))];

  const result = loadRules({
    workers: [brandSchemas.workerKindName.parse('atc.session')],
    checkout: {
      commit: '3f2a1c0',
      files: new Map([rulesFile, ...promptFiles]),
    },
    concepts: [],
    pins: new Map(),
    phases,
  });

  invariant(
    result.kind === 'loaded',
    `the mock rules file failed to load: ${JSON.stringify(result)}`,
  );

  return result.rules;
}
