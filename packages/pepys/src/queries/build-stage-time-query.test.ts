import { expect, onTestFinished, test } from 'bun:test';
import { createTestStore } from '@pepys/testing';
import { boxxySource } from '../boxxy-source.ts';
import { buildBoxxyPlugin } from '../build-boxxy-plugin.ts';
import { buildForeignStandIn } from '../test-utils/build-foreign-stand-in.ts';
import { buildMockItemFacts } from '../test-utils/build-mock-item-facts.ts';
import { buildStageTimeQuery } from './build-stage-time-query.ts';

async function setupTest() {
  const standIn = buildForeignStandIn();
  const query = buildStageTimeQuery(standIn.foreign.delivery);

  const store = await createTestStore({
    plugins: [buildBoxxyPlugin(standIn.foreign), ...standIn.plugins],
  });

  onTestFinished(() => store[Symbol.asyncDispose]());

  return { store, query, setDeliveries: standIn.setDeliveries };
}

test('it answers the minutes of each step from the attempts and the delivery times of the item', async () => {
  const ctx = await setupTest();

  const scenario = buildMockItemFacts();

  await ctx.store.apply(boxxySource, scenario.applied, {
    sender: { issuer: 'https://boxxy.example', subject: 'boxxy-server' },
  });

  ctx.setDeliveries('boxxy:item:0193a1b2-0000-7000-8000-000000000001', [
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
    rework: { count: 1, minutes: 48 },
    reviewWaitMinutes: 8,
    sleepMinutes: 20,
    pullRequests: ['github:pull_request:9001'],
  });
});

test('it answers the phase times of an item that has no pull request yet', async () => {
  const ctx = await setupTest();

  const scenario = buildMockItemFacts();

  await ctx.store.apply(boxxySource, scenario.applied, {
    sender: { issuer: 'https://boxxy.example', subject: 'boxxy-server' },
  });

  const times = await ctx.store.query(ctx.query, {
    item: 'boxxy:item:0193a1b2-0000-7000-8000-000000000001',
    environment: 'production',
  });

  expect(times.steps.map((step) => step.minutes)).toStrictEqual([
    4,
    null,
    70,
    38,
    null,
    null,
    null,
  ]);
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
