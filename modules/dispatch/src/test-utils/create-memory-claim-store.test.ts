import { expect, test } from 'bun:test';
import { claimStoreContract } from './claim-store-contract.ts';
import { createMemoryClaimStore } from './create-memory-claim-store.ts';

function setupTest() {
  return { store: createMemoryClaimStore() };
}

test.each(claimStoreContract)('it keeps the ClaimStore contract: %s', async (_title, check) => {
  const ctx = setupTest();

  const outcome = await check(ctx.store);

  expect(outcome.received).toStrictEqual(outcome.expected);
});
