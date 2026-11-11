import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { createMemoryClaimStore } from './create-memory-claim-store.ts';
import { createTestDispatch } from './create-test-dispatch.ts';

test('it claims and starts an item seeded at a phase in one tick', async () => {
  const dispatch = await createTestDispatch();
  const item = await dispatch.seedItem({ phase: brandSchemas.phaseName.parse('build') });

  await dispatch.tick();

  const [attempt] = await dispatch.store.read((tx) => tx.listItemAttempts(item));

  const received: unknown = [attempt?.phase, attempt?.state];

  expect(received).toStrictEqual(['build', 'running']);
});

test('it seeds into the store it is given', async () => {
  const store = createMemoryClaimStore();

  const dispatch = await createTestDispatch({ store });
  const item = await dispatch.seedItem({ phase: brandSchemas.phaseName.parse('build') });
  const row = await store.read((tx) => tx.readItem(item, dispatch.clock.now(), dispatch.rules()));

  expect(row?.id).toBe(item);
});

test('it seeds an item with no phase at the first phase of its pipeline', async () => {
  const dispatch = await createTestDispatch();
  const item = await dispatch.seedItem({});

  await dispatch.tick();

  const [attempt] = await dispatch.store.read((tx) => tx.listItemAttempts(item));

  const phase: unknown = attempt?.phase;

  expect(phase).toBe('triage');
});
