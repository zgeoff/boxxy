import { expect, test } from 'bun:test';
import { contentHash } from '@boxxy/content-hash';
import type { Concept, ConceptPin } from '@boxxy/model';
import { brandSchemas, defineSignal } from '@boxxy/model';
import { buildMockPhaseKind } from '@boxxy/model/test-utils/build-mock-phase-kind';
import { z } from 'zod';
import { loadRules } from './load-rules.ts';

interface LoadInput {
  readonly on: string;
  readonly mergeExtra: string;
}

function setupTest() {
  const bothEdges =
    'needs-signoff: { hold: owner sign-off }, changes-requested: { to: build, max: 3 }';

  const oneRule = "\n  signoff:\n    - { name: skills, paths: ['**/SKILL.md'] }";

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
    bothEdges,
    oneRule,
    load: (input: LoadInput) => {
      const edges = ['merged: { end: merged }', input.on].filter((edge) => edge !== '');
      const onEdges = edges.join(', ');

      return loadRules({
        workers: [
          brandSchemas.workerKindName.parse('atc.session'),
          brandSchemas.workerKindName.parse('merge.forge'),
        ],
        checkout: {
          commit: '3f2a1c0',
          files: new Map([
            [
              'rules.yaml',
              new TextEncoder().encode(`
version: 1
concepts: [pool@1]
pipelines:
  standard:
    - { phase: build, maxAttempts: 2, timeoutMinutes: 180, on: { built: next } }
    - { phase: merge, maxAttempts: 2, timeoutMinutes: 240, on: { ${onEdges} } }
kinds:
  core.issue: { pipeline: standard, recipes: { build: build-v1, merge: build-v1 } }
recipes:
  build-v1: { agent: claude, model: example-model, effort: high, prompt: prompts/build-v1.md, source: subscription, skills: [] }
merge:
  method: squash${input.mergeExtra}
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
          buildMockPhaseKind({
            name: 'merge',
            outcomes: ['merged'],
            worker: 'merge.forge',
            conditionalOutcomes: [
              {
                outcome: 'needs-signoff',
                requiredWhen: (rules) => (rules.merge?.signoff.length ?? 0) > 0,
              },
              {
                outcome: 'changes-requested',
                requiredWhen: (rules) => (rules.merge?.signoff.length ?? 0) > 0,
              },
            ],
          }),
        ],
        pins,
      });
    },
  };
}

test('it loads a rules file with no sign-off rules and no sign-off edges', () => {
  const ctx = setupTest();
  const result = ctx.load({ on: '', mergeExtra: '' });

  expect(result.kind).toBe('loaded');
});

test('it loads sign-off rules with the rule defaults and both sign-off edges', () => {
  const ctx = setupTest();
  const result = ctx.load({ on: ctx.bothEdges, mergeExtra: ctx.oneRule });

  expect(result).toMatchObject({
    kind: 'loaded',
    rules: {
      merge: {
        signoff: [{ name: 'skills', paths: ['**/SKILL.md'], repos: null }],
      },
    },
  });
});

test('it keeps the repos of a sign-off rule', () => {
  const ctx = setupTest();

  const result = ctx.load({
    on: ctx.bothEdges,
    mergeExtra: "\n  signoff:\n    - { name: skills, paths: ['a/**'], repos: [acme/skills] }",
  });

  expect(result).toMatchObject({
    kind: 'loaded',
    rules: { merge: { signoff: [{ repos: ['acme/skills'] }] } },
  });
});

test('it rejects a sign-off rule with an empty paths list', () => {
  const ctx = setupTest();

  const result = ctx.load({
    on: ctx.bothEdges,
    mergeExtra: '\n  signoff:\n    - { name: skills, paths: [] }',
  });

  expect(result.kind).toBe('rejected');
});

test('it rejects two sign-off rules with one name', () => {
  const ctx = setupTest();

  const result = ctx.load({
    on: ctx.bothEdges,
    mergeExtra:
      "\n  signoff:\n    - { name: skills, paths: ['a'] }\n    - { name: skills, paths: ['b'] }",
  });

  expect(result).toStrictEqual({
    kind: 'rejected',
    rejections: [
      {
        file: 'rules.yaml',
        path: 'merge.signoff[1].name',
        reason: { kind: 'duplicate-signoff-rule', name: 'skills' },
      },
    ],
  });
});

test.each([
  {
    title: 'sign-off rules and no sign-off edges',
    on: '',
    reasons: [
      { kind: 'unmapped-outcome', phase: 'merge', outcome: 'needs-signoff' },
      { kind: 'unmapped-outcome', phase: 'merge', outcome: 'changes-requested' },
    ],
  },
  {
    title: 'sign-off rules and only the changes-requested edge',
    on: 'changes-requested: { to: build, max: 3 }',
    reasons: [{ kind: 'unmapped-outcome', phase: 'merge', outcome: 'needs-signoff' }],
  },
  {
    title: 'a needs-signoff edge that is not a hold',
    on: 'needs-signoff: { end: waiting }, changes-requested: { to: build, max: 3 }',
    reasons: [
      { kind: 'signoff-edge-kind', phase: 'merge', outcome: 'needs-signoff', expected: 'hold' },
    ],
  },
  {
    title: 'a changes-requested edge that is not a jump',
    on: 'needs-signoff: { hold: owner sign-off }, changes-requested: { end: sent-back }',
    reasons: [
      { kind: 'signoff-edge-kind', phase: 'merge', outcome: 'changes-requested', expected: 'to' },
    ],
  },
])('it rejects $title', (row) => {
  const ctx = setupTest();
  const result = ctx.load({ on: row.on, mergeExtra: ctx.oneRule });

  const reasons: unknown =
    result.kind === 'rejected' ? result.rejections.map((entry) => entry.reason) : [];

  expect(reasons).toStrictEqual(row.reasons);
});

test.each([
  ['needs-signoff', 'needs-signoff: { hold: owner sign-off }'],
  ['changes-requested', 'changes-requested: { to: build, max: 3 }'],
])('it rejects a %s edge when the rules set no sign-off rules', (outcome, on) => {
  const ctx = setupTest();
  const result = ctx.load({ on, mergeExtra: '' });

  const reasons: unknown =
    result.kind === 'rejected' ? result.rejections.map((entry) => entry.reason) : [];

  expect(reasons).toStrictEqual([{ kind: 'unknown-outcome', phase: 'merge', outcome }]);
});
