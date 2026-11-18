import { contentHash } from '@boxxy/content-hash';
import type { Concept, ConceptPin, LoadResult, WaitKind, WorkerKindName } from '@boxxy/model';
import { brandSchemas, defineSignal } from '@boxxy/model';
import { buildMockPhaseKind } from '@boxxy/model/test-utils/build-mock-phase-kind';
import { z } from 'zod';
import { loadRules } from '../loading/load-rules.ts';

export interface WaitRulesInput {
  // lines of the file before `pipelines`, such as a `repos` section
  readonly head?: string;

  // the second step of the `standard` pipeline; a `verify` step that waits on `shipped` when left out
  readonly step?: string;

  // the wait kinds the server registers; one `shipped` wait on `merge.forge` when left out
  readonly waits?: readonly WaitKind[];

  // the workers the server built; `atc.session` and `merge.forge` when left out
  readonly workers?: readonly WorkerKindName[];
  readonly spawnRepos?: readonly string[];
}

// A wait that holds, which comes after the `built` outcome of the build step
export function buildMockWaitKind(overrides: Partial<WaitKind> = {}): WaitKind {
  return { name: 'shipped', after: { outcome: 'built' }, read: () => 'holds', ...overrides };
}

// A two-step pipeline, build then verify, through the real loader with a registered wait kind
export function loadWaitRules(input: WaitRulesInput = {}): LoadResult {
  const atc = brandSchemas.workerKindName.parse('atc.session');
  const forgeWorker = brandSchemas.workerKindName.parse('merge.forge');

  const concepts: Concept[] = [
    {
      name: 'pool',
      version: 1,
      signals: [defineSignal({ name: 'oldest', params: z.object({}), value: () => null })],
    },
  ];

  const pins = new Map<string, ConceptPin>([
    ['pool', { ref: 'pool@1', sourceHash: contentHash('pool source') }],
  ]);

  const step =
    input.step ??
    '    - { phase: verify, maxAttempts: 1, timeoutMinutes: 30, waits: [shipped], skip: next, on: { verified: next } }';

  const text = `
version: 1
concepts: [pool@1]
${input.head ?? ''}
pipelines:
  standard:
    - { phase: build, maxAttempts: 2, timeoutMinutes: 180, on: { built: next } }
${step}
kinds:
  core.issue: { pipeline: standard, recipes: { build: build-v1, verify: build-v1 } }
recipes:
  build-v1: { agent: claude, model: example-model, effort: high, prompt: prompts/build-v1.md, source: subscription, skills: [] }
relationTypes: [blocks]
limits:
  - { name: workers, max: 7, counts: {} }
pools:
  - { name: build, takes: {}, order: [oldest] }
sleep: { afterIdleMinutes: 30, afterQuietMinutes: 60, afterUnattendedMinutes: 240 }
`;

  return loadRules({
    workers: input.workers ?? [atc, forgeWorker],
    waits: input.waits ?? [buildMockWaitKind({ worker: forgeWorker })],
    spawn: { agents: {}, phases: {}, repos: input.spawnRepos ?? [] },
    checkout: {
      commit: '3f2a1c0',
      files: new Map([
        ['rules.yaml', new TextEncoder().encode(text)],
        ['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}.\n')],
      ]),
    },
    concepts,
    phases: [
      buildMockPhaseKind({ name: 'build', outcomes: ['built'] }),
      buildMockPhaseKind({ name: 'verify', outcomes: ['verified'] }),
    ],
    pins,
  });
}
