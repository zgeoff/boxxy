import { expect, expectTypeOf, onTestFinished, test } from 'bun:test';
import { buildMockGateReading } from '@boxxy/model/test-utils/build-mock-gate-reading';
import { githubDelivery } from '@pepys/source-github';
import { createTestStore } from '@pepys/testing';
import { boxxySource } from '../boxxy-source.ts';
import { buildBoxxyPlugin } from '../build-boxxy-plugin.ts';
import { buildForeignStandIn } from '../test-utils/build-foreign-stand-in.ts';
import { buildMockAppliedFact } from '../test-utils/build-mock-applied-fact.ts';
import { buildMockItemFacts } from '../test-utils/build-mock-item-facts.ts';
import { toEntityID } from '../test-utils/to-entity-id.ts';
import { buildStageTimeQuery } from './build-stage-time-query.ts';
import type { DeliveryReads, DeliverySelectOptions } from './types.ts';

async function setupTest() {
  const standIn = buildForeignStandIn();
  const query = buildStageTimeQuery(standIn.foreign.delivery);

  const store = await createTestStore({
    plugins: [buildBoxxyPlugin(standIn.foreign), ...standIn.plugins],
  });

  onTestFinished(() => store[Symbol.asyncDispose]());

  return { store, query, setDeliveries: standIn.setDeliveries, selects: standIn.selects };
}

test('it answers the minutes of each step from the attempts and the delivery times of the item', async () => {
  const ctx = await setupTest();

  const scenario = buildMockItemFacts();

  await ctx.store.apply(boxxySource, scenario.applied, {
    sender: { issuer: 'https://boxxy.example', subject: 'boxxy-server' },
  });

  ctx.setDeliveries([
    {
      pullRequest: 'github:pull_request:9001',
      mergedAt: '2026-11-11T05:00:00Z',
      release: { at: '2026-11-11T06:00:00Z' },
      deploy: null,
    },
  ]);

  const times = await ctx.store.query(ctx.query, {
    item: 'boxxy:item:0193a1b2-0000-7000-8000-000000000001',
    environment: 'production',
  });

  expect(times).toStrictEqual({
    item: 'boxxy:item:0193a1b2-0000-7000-8000-000000000001',
    environment: 'production',
    steps: [
      { step: 'triage', minutes: 4, endedAt: '2026-11-11T02:05:00.000Z' },
      { step: 'design', minutes: null, endedAt: null },
      { step: 'build', minutes: 70, endedAt: '2026-11-11T04:10:00.000Z' },
      { step: 'review', minutes: 38, endedAt: '2026-11-11T04:30:00.000Z' },
      { step: 'merge', minutes: 30, endedAt: '2026-11-11T05:00:00Z' },
      { step: 'release', minutes: 60, endedAt: '2026-11-11T06:00:00Z' },
      { step: 'deploy', minutes: null, endedAt: null },
    ],
    rework: { count: 1, minutes: 48, unrelatedLines: null },
    reviewWaitMinutes: 8,
    sleepMinutes: 20,
    pullRequests: ['github:pull_request:9001'],
  });
});

test('it sums the unrelated lines of the review close-outs, and starts the merge step at the claim of the merge attempt after the latest passed review', async () => {
  const ctx = await setupTest();

  const scenario = buildMockItemFacts();
  const recheck = '0193a1b2-0000-7000-8000-0000000000a6';
  const merge = '0193a1b2-0000-7000-8000-0000000000a7';
  const entity = 'boxxy:item:0193a1b2-0000-7000-8000-000000000001';

  const later = [
    buildMockAppliedFact('boxxy.attempt.closed_out', {
      event: 'f30',
      at: '2026-11-11T04:29:00.000Z',
      entity,
      payload: {
        attempt: scenario.attempts.rereview,
        phase: 'review',
        closeOut: {
          round: 2,
          cause: 'rework',
          reading: buildMockGateReading({ status: 'passed' }),
          unrelatedLines: 4,
        },
      },
    }),
    buildMockAppliedFact('boxxy.attempt.claimed', {
      event: 'f31',
      at: '2026-11-11T04:40:00.000Z',
      entity,
      payload: { attempt: recheck, phase: 'review', number: 3, round: 3 },
    }),
    buildMockAppliedFact('boxxy.attempt.closed_out', {
      event: 'f32',
      at: '2026-11-11T04:44:00.000Z',
      entity,
      payload: {
        attempt: recheck,
        phase: 'review',
        closeOut: {
          round: 3,
          cause: 'recheck',
          reading: buildMockGateReading({ status: 'passed' }),
          unrelatedLines: 2,
        },
      },
    }),
    buildMockAppliedFact('boxxy.attempt.settled', {
      event: 'f33',
      at: '2026-11-11T04:45:00.000Z',
      entity,
      payload: { attempt: recheck, phase: 'review', round: 3, outcome: 'passed' },
    }),
    buildMockAppliedFact('boxxy.attempt.claimed', {
      event: 'f34',
      at: '2026-11-11T04:48:00.000Z',
      entity,
      payload: { attempt: merge, phase: 'merge', number: 1 },
    }),
  ];

  await ctx.store.apply(boxxySource, [...scenario.applied, ...later], {
    sender: { issuer: 'https://boxxy.example', subject: 'boxxy-server' },
  });

  ctx.setDeliveries([
    {
      pullRequest: 'github:pull_request:9001',
      mergedAt: '2026-11-11T05:00:00Z',
      release: null,
      deploy: null,
    },
  ]);

  const times = await ctx.store.query(ctx.query, {
    item: 'boxxy:item:0193a1b2-0000-7000-8000-000000000001',
    environment: 'production',
  });

  expect({ merge: times.steps[4], unrelatedLines: times.rework.unrelatedLines }).toStrictEqual({
    merge: { step: 'merge', minutes: 12, endedAt: '2026-11-11T05:00:00Z' },
    unrelatedLines: 6,
  });
});

test('it answers the phase times of an item that has no pull request yet, and selects no delivery', async () => {
  const ctx = await setupTest();

  const scenario = buildMockItemFacts();

  await ctx.store.apply(
    boxxySource,
    scenario.applied.filter((fact) => fact.type !== 'boxxy.pull_request.linked'),
    { sender: { issuer: 'https://boxxy.example', subject: 'boxxy-server' } },
  );

  const times = await ctx.store.query(ctx.query, {
    item: 'boxxy:item:0193a1b2-0000-7000-8000-000000000001',
    environment: 'production',
  });

  expect({
    minutes: times.steps.map((step) => step.minutes),
    pullRequests: times.pullRequests,
    selects: ctx.selects,
  }).toStrictEqual({
    minutes: [4, null, 70, 38, null, null, null],
    pullRequests: [],
    selects: [],
  });
});

test('it selects the delivery of a pull request once when two attempts of the item produced it', async () => {
  const ctx = await setupTest();

  const scenario = buildMockItemFacts();

  const relinked = buildMockAppliedFact('boxxy.pull_request.linked', {
    event: 'f22',
    at: '2026-11-11T04:00:00.000Z',
    entity: 'boxxy:item:0193a1b2-0000-7000-8000-000000000001',
    payload: { attempt: scenario.attempts.rebuild, pullRequestId: '9001' },
  });

  await ctx.store.apply(boxxySource, [...scenario.applied, relinked], {
    sender: { issuer: 'https://boxxy.example', subject: 'boxxy-server' },
  });

  ctx.setDeliveries([
    {
      pullRequest: 'github:pull_request:9001',
      mergedAt: '2026-11-11T05:00:00Z',
      release: null,
      deploy: null,
    },
  ]);

  const times = await ctx.store.query(ctx.query, {
    item: 'boxxy:item:0193a1b2-0000-7000-8000-000000000001',
    environment: 'production',
  });

  expect({ pullRequests: times.pullRequests, selects: ctx.selects }).toStrictEqual({
    pullRequests: ['github:pull_request:9001'],
    selects: [
      { pullRequests: [toEntityID('github:pull_request:9001')], environment: 'production' },
    ],
  });
});

test('it takes the GitHub plug-in delivery module, whose select refuses plain strings', () => {
  expectTypeOf(githubDelivery).toExtend<DeliveryReads>();
  expectTypeOf<readonly [string]>().not.toExtend<DeliverySelectOptions['pullRequests']>();
});

test('it answers null minutes for every step of an input that names no boxxy item', async () => {
  const ctx = await setupTest();

  const times = await ctx.store.query(ctx.query, {
    item: 'github:pull_request:9001',
    environment: 'production',
  });

  expect(times.steps.map((step) => step.minutes)).toStrictEqual([
    null,
    null,
    null,
    null,
    null,
    null,
    null,
  ]);
});
