import { expect, onTestFinished, test } from 'bun:test';
import { applyInBothOrders, createTestStore } from '@pepys/testing';
import { boxxySource } from '../boxxy-source.ts';
import { boxxyWorkPlugin } from '../boxxy-work-plugin.ts';
import { buildForeignStandIn } from '../test-utils/build-foreign-stand-in.ts';
import { buildMockItemFacts } from '../test-utils/build-mock-item-facts.ts';
import { boxxyWorkConsumer } from './boxxy-work-consumer.ts';

async function setupTest() {
  const store = await createTestStore({
    plugins: [boxxyWorkPlugin, ...buildForeignStandIn().plugins],
  });

  onTestFinished(() => store[Symbol.asyncDispose]());

  return { store };
}

test('it writes the item row and the state of each attempt from the facts of the item', async () => {
  const ctx = await setupTest();

  const scenario = buildMockItemFacts();

  await ctx.store.apply(boxxySource, scenario.applied, {
    sender: { issuer: 'https://boxxy.example', subject: 'boxxy-server' },
  });

  const items = await ctx.store.readRows('boxxy_item');
  const attempts = await ctx.store.readRows('boxxy_attempt');

  expect({
    items,
    attempts: attempts.map((row) => [row['id'], row['state'], row['outcome']]),
  }).toStrictEqual({
    items: [
      {
        id: 'boxxy:item:0193a1b2-0000-7000-8000-000000000001',
        kind: 'core.issue',
        repo: 'shoal/charts',
        title: 'Chart the shoals',
        design_mode: null,
        filed_at: '2026-11-11T02:00:00.000Z',
        closed_at: null,
        close_reason: null,
        updated_at: '2026-11-11T02:00:00.000Z',
      },
    ],
    attempts: [
      [`boxxy:attempt:${scenario.attempts.triage}`, 'succeeded', 'accepted'],
      [`boxxy:attempt:${scenario.attempts.build}`, 'succeeded', 'built'],
      [`boxxy:attempt:${scenario.attempts.review}`, 'succeeded', 'changes-requested'],
      [`boxxy:attempt:${scenario.attempts.rebuild}`, 'succeeded', 'built'],
      [`boxxy:attempt:${scenario.attempts.rereview}`, 'succeeded', 'passed'],
    ],
  });
});

test('it links an attempt to its item, its pull request and each session it ran in', async () => {
  const ctx = await setupTest();

  const scenario = buildMockItemFacts();
  const build = `boxxy:attempt:${scenario.attempts.build}`;

  await ctx.store.apply(boxxySource, scenario.applied, {
    sender: { issuer: 'https://boxxy.example', subject: 'boxxy-server' },
  });

  const links = await ctx.store.readLinks();

  expect(
    links
      .filter((link) => link.from_id === build)
      .map((link) => [link.type, link.to_id, link.evidence]),
  ).toStrictEqual([
    ['attempt_of', 'boxxy:item:0193a1b2-0000-7000-8000-000000000001', 'event:boxxy:f05'],
    ['produced', 'github:pull_request:9001', 'event:boxxy:f08'],
    ['ran_in', 'telemetry:session:agent-7', 'event:boxxy:f07'],
    ['ran_in', 'telemetry:session:s-build', 'event:boxxy:f06'],
  ]);
});

test('it writes a session row with the caller of the attempt for a later attempt in the same atc session', async () => {
  const ctx = await setupTest();

  const scenario = buildMockItemFacts();

  await ctx.store.apply(boxxySource, scenario.applied, {
    sender: { issuer: 'https://boxxy.example', subject: 'boxxy-server' },
  });

  const sessions = await ctx.store.readRows('boxxy_attempt_session');

  expect(sessions).toContainEqual({
    attempt_id: `boxxy:attempt:${scenario.attempts.rebuild}`,
    session_id: 'telemetry:session:s-build',
    key: 'atc',
    product: null,
    caller_issuer: 'https://broker.example',
    caller_subject: 'imp-builder',
    bound_at: '2026-11-11T03:40:05.000Z',
  });
});

test('it writes the same rows and links whichever order the facts of an item arrive in', async () => {
  const scenario = buildMockItemFacts();

  const report = await applyInBothOrders({
    plugins: [boxxyWorkPlugin, ...buildForeignStandIn().plugins],
    source: boxxySource,
    facts: scenario.applied,
  });

  expect(report.isSame).toBe(true);
});

test('it declares the id and actor column of each entity view with the entityID kind', () => {
  const tables: Readonly<Record<string, { columns: Readonly<Record<string, { kind: string }>> }>> =
    boxxyWorkConsumer.tables;

  const kinds = boxxyWorkConsumer.entityViews.map((view) => {
    const columns = tables[view.table]?.columns ?? {};

    return {
      table: view.table,
      id: columns[view.id]?.kind,
      actor: view.actor === null ? null : columns[view.actor]?.kind,
    };
  });

  expect(kinds).toStrictEqual([
    { table: 'boxxy_item', id: 'entityID', actor: null },
    { table: 'boxxy_attempt', id: 'entityID', actor: null },
  ]);
});
