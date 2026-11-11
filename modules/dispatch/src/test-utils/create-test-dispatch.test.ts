import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { createTestDispatch } from './create-test-dispatch.ts';

test('it claims and starts an item seeded at a phase in one tick', async () => {
  const dispatch = await createTestDispatch();
  const item = await dispatch.seedItem({ phase: brandSchemas.phaseName.parse('build') });

  await dispatch.tick();

  const [attempt] = await dispatch.store.read((tx) => tx.listItemAttempts(item));

  const received: unknown = [attempt?.phase, attempt?.state];

  expect(received).toStrictEqual(['build', 'running']);
});
