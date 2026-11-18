import { expect, test } from 'bun:test';
import { contentHash } from '@boxxy/content-hash';
import type { Concept, ConceptPin } from '@boxxy/model';
import { brandSchemas, defineSignal } from '@boxxy/model';
import { buildMockPhaseKind } from '@boxxy/model/test-utils/build-mock-phase-kind';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { loadRules } from './load-rules.ts';

function setupTest() {
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

  return {
    load: (head: string, verifyStep: string) =>
      loadRules({
        workers: [brandSchemas.workerKindName.parse('atc.session')],
        checkout: {
          commit: '3f2a1c0',
          files: new Map([
            [
              'rules.yaml',
              new TextEncoder().encode(`
version: 1
concepts: [pool@1]
${head}
pipelines:
  standard:
    - { phase: build, maxAttempts: 2, timeoutMinutes: 180, on: { built: next } }
${verifyStep}
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
`),
            ],
            ['prompts/build-v1.md', new TextEncoder().encode('Build {{title}}.\n')],
          ]),
        },
        concepts,
        phases: [
          buildMockPhaseKind({ name: 'build', outcomes: ['built'] }),
          buildMockPhaseKind({ name: 'verify', outcomes: ['verified'] }),
        ],
        pins,
      }),
  };
}

test('it loads a step with its gates and skip edge', () => {
  const ctx = setupTest();

  const result = ctx.load(
    'criterionTags: [prod]',
    "    - { phase: verify, maxAttempts: 1, timeoutMinutes: 30, criteria: { tagged: prod }, skipWhen: [{ checkPassed: 'verify / gate' }], skip: { end: merged }, on: { verified: next } }",
  );

  invariant(result.kind === 'loaded', 'the rules load');

  const kind = brandSchemas.itemKindName.parse('core.issue');
  const step: unknown = result.rules.kinds.get(kind)?.pipeline.steps[1];

  expect(result.rules.criterionTags).toStrictEqual(['prod']);

  const expected: unknown = {
    phase: 'verify',
    maxAttempts: 1,
    timeoutMinutes: 30,
    on: { verified: 'next' },
    criteria: { tagged: 'prod' },
    skipWhen: [{ checkPassed: 'verify / gate' }],
    skip: { end: 'merged' },
  };

  expect(step).toStrictEqual(expected);
});

test.each([
  {
    title: 'a gate with no skip edge',
    head: 'criterionTags: [prod]',
    step: '    - { phase: verify, maxAttempts: 1, timeoutMinutes: 30, criteria: { tagged: prod }, on: { verified: next } }',
    path: 'pipelines.standard[1]',
    reason: { kind: 'gate-without-skip', phase: 'verify' },
  },
  {
    title: 'a skipWhen with no skip edge',
    head: 'criterionTags: [prod]',
    step: "    - { phase: verify, maxAttempts: 1, timeoutMinutes: 30, skipWhen: [{ checkPassed: 'verify / gate' }], on: { verified: next } }",
    path: 'pipelines.standard[1]',
    reason: { kind: 'gate-without-skip', phase: 'verify' },
  },
  {
    title: 'an unknown skip condition',
    head: 'criterionTags: [prod]',
    step: '    - { phase: verify, maxAttempts: 1, timeoutMinutes: 30, skipWhen: [{ branchMerged: main }], skip: next, on: { verified: next } }',
    path: 'pipelines.standard[1].skipWhen[0]',
    reason: { kind: 'unknown-skip-condition', phase: 'verify', condition: 'branchMerged' },
  },
  {
    title: 'a criteria tag the file does not list',
    head: 'criterionTags: [prod]',
    step: '    - { phase: verify, maxAttempts: 1, timeoutMinutes: 30, criteria: { tagged: qa }, skip: next, on: { verified: next } }',
    path: 'pipelines.standard[1].criteria.tagged',
    reason: { kind: 'unknown-criterion-tag', phase: 'verify', tag: 'qa' },
  },
  {
    title: 'a skip hold that names an engine hold reason',
    head: 'criterionTags: [prod]',
    step: '    - { phase: verify, maxAttempts: 1, timeoutMinutes: 30, criteria: { tagged: prod }, skip: { hold: rounds used up }, on: { verified: next } }',
    path: 'pipelines.standard[1].skip.hold',
    reason: {
      kind: 'engine-hold-reason',
      phase: 'verify',
      outcome: 'skipped',
      reason: 'rounds used up',
    },
  },
])('it rejects $title', (row) => {
  const ctx = setupTest();
  const loaded: unknown = ctx.load(row.head, row.step);

  expect(loaded).toStrictEqual({
    kind: 'rejected',
    rejections: [{ file: 'rules.yaml', path: row.path, reason: row.reason }],
  });
});

test.each([['again'], ['{ to: build, max: 2 }']])(
  'it rejects the skip edge %s as invalid',
  (edge) => {
    const ctx = setupTest();

    const result = ctx.load(
      'criterionTags: [prod]',
      `    - { phase: verify, maxAttempts: 1, timeoutMinutes: 30, criteria: { tagged: prod }, skip: ${edge}, on: { verified: next } }`,
    );

    expect(result.kind).toBe('rejected');
  },
);

test('it rejects a criterion tag listed twice', () => {
  const ctx = setupTest();

  const result = ctx.load(
    'criterionTags: [prod, prod]',
    '    - { phase: verify, maxAttempts: 1, timeoutMinutes: 30, on: { verified: next } }',
  );

  expect(result).toMatchObject({
    kind: 'rejected',
    rejections: [{ path: 'criterionTags[1]', reason: { kind: 'invalid' } }],
  });
});
