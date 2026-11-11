import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { buildMockSettled } from '@boxxy/model/test-utils/build-mock-settled';
import { buildMockV1ItemView } from '@boxxy/model/test-utils/build-mock-v1-item-view';
import { loadMockRules } from '../test-utils/load-mock-rules.ts';
import { dryRunRules } from './dry-run-rules.ts';

function setupTest() {
  return {
    build: { phase: 'build', maxAttempts: 2, timeoutMinutes: 30 },
    review: { phase: 'review', maxAttempts: 2, timeoutMinutes: 30 },
    buildOn: { built: 'next', blocked: 'again', abandoned: 'again' },
  };
}

test('it gives an item the same position under both rules when nothing changed', () => {
  const ctx = setupTest();

  const steps = [
    { ...ctx.build, on: ctx.buildOn },
    {
      ...ctx.review,
      on: { passed: { end: 'reviewed' }, 'changes-requested': { to: 'build', max: 3 } },
    },
  ];

  const item = buildMockV1ItemView();

  const lines: unknown = dryRunRules({
    current: loadMockRules({ steps }),
    proposed: loadMockRules({ steps }),
    items: [
      {
        item,
        attempts: [buildMockSettled({ phase: 'build', outcome: 'built', endedAt: 1000 })],
        retries: [],
      },
    ],
  });

  expect(lines).toStrictEqual([
    {
      item: item.id,
      now: { kind: 'phase', phase: 'review', round: 1 },
      // oxlint-disable-next-line unicorn/no-thenable -- `then` names the phase a hold resumes; the object is never awaited
      then: { kind: 'phase', phase: 'review', round: 1 },
      moved: false,
    },
  ]);
});

test('it lists the position an item would get when an edge changed', () => {
  const ctx = setupTest();
  const item = buildMockV1ItemView();

  const lines: unknown = dryRunRules({
    current: loadMockRules({
      steps: [
        { ...ctx.build, on: ctx.buildOn },
        { ...ctx.review, on: { passed: 'next', 'changes-requested': 'again' } },
      ],
    }),
    proposed: loadMockRules({
      steps: [
        { ...ctx.build, on: { ...ctx.buildOn, built: { end: 'shipped' } } },
        { ...ctx.review, on: { passed: 'next', 'changes-requested': 'again' } },
      ],
    }),
    items: [
      {
        item,
        attempts: [buildMockSettled({ phase: 'build', outcome: 'built', endedAt: 1000 })],
        retries: [],
      },
    ],
  });

  expect(lines).toStrictEqual([
    {
      item: item.id,
      now: { kind: 'phase', phase: 'review', round: 1 },
      // oxlint-disable-next-line unicorn/no-thenable -- `then` names the phase a hold resumes; the object is never awaited
      then: { kind: 'end', reason: 'shipped' },
      moved: true,
    },
  ]);
});

test('it folds an item over the pipeline of its own kind', () => {
  const ctx = setupTest();
  const item = buildMockV1ItemView({ kind: brandSchemas.itemKindName.parse('core.idea') });
  const steps = [{ ...ctx.build, on: ctx.buildOn }];

  const lines: unknown = dryRunRules({
    current: loadMockRules({ steps, kinds: { 'core.idea': 'standard' } }),
    proposed: loadMockRules({ steps, kinds: { 'core.idea': 'standard' } }),
    items: [{ item, attempts: [], retries: [] }],
  });

  expect(lines).toMatchObject([{ now: { kind: 'phase', phase: 'build', round: 1 } }]);
});

test('it ends an item whose kind the proposed rules drop, with no-pipeline', () => {
  const ctx = setupTest();
  const item = buildMockV1ItemView({ kind: brandSchemas.itemKindName.parse('core.idea') });
  const steps = [{ ...ctx.build, on: ctx.buildOn }];

  const lines: unknown = dryRunRules({
    current: loadMockRules({ steps, kinds: { 'core.idea': 'standard' } }),
    proposed: loadMockRules({ steps }),
    items: [{ item, attempts: [], retries: [] }],
  });

  expect(lines).toMatchObject([
    // oxlint-disable-next-line unicorn/no-thenable -- `then` names the phase a hold resumes; the object is never awaited
    { now: { kind: 'phase' }, then: { kind: 'end', reason: 'no-pipeline' }, moved: true },
  ]);
});
