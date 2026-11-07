import { expect, test } from 'bun:test';
import { createTestClaimStore } from './create-test-claim-store.ts';

test('it opens an empty migrated store', async () => {
  const store = await createTestClaimStore();
  const lag = await store.read((transaction) => transaction.readOutboxLag());

  expect(lag).toStrictEqual({ unsent: 0, oldestUnsentAt: null });
});
