import { test } from 'bun:test';
import { claimStoreContract } from '@boxxy/dispatch/test-utils/claim-store-contract';
import { createTestClaimStore } from './test-utils/create-test-claim-store.ts';

async function setupTest() {
  return { store: await createTestClaimStore() };
}

test.each(claimStoreContract)('it keeps the ClaimStore contract: %s', async (_title, check) => {
  const ctx = await setupTest();

  await check(ctx.store);
});
