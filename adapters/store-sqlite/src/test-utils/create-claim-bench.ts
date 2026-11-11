import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { claimNext } from '@boxxy/dispatch';
import { createTestDispatch } from '@boxxy/dispatch/test-utils/create-test-dispatch';
import type { ItemId } from '@boxxy/model';
import { createSQLiteClaimStore } from '../create-sqlite-claim-store.ts';

export interface ClaimBenchOptions {
  readonly itemCount: number;
}

export interface ClaimBench extends AsyncDisposable {
  // one `claimNext` call, which holds the store's lock for the whole decision; throws when it
  // picks no item
  readonly claim: () => Promise<ItemId>;
}

// A SQLite store in a temp folder, seeded with open items at their pipeline's first phase, and
// every limit raised to the item count, so each claim finds a free seat with no close or settle
// between claims.
export async function createClaimBench(options: ClaimBenchOptions): Promise<ClaimBench> {
  const stack = new AsyncDisposableStack();

  const folder = await mkdtemp(join(tmpdir(), 'boxxy-claim-bench-'));

  stack.defer(() => rm(folder, { recursive: true, force: true }));

  const store = await createSQLiteClaimStore(join(folder, 'store.db'));

  stack.defer(() => store.close());

  const dispatch = await createTestDispatch({ store });

  const rules = dispatch.rules();
  const limits = rules.limits.map((limit) => ({ ...limit, max: options.itemCount }));

  dispatch.setRules({ ...rules, limits });

  await store.exclusive((tx) => tx.syncLimits(limits, dispatch.clock.now()));

  for (let index = 0; index < options.itemCount; index += 1) {
    await dispatch.seedItem({});
  }

  return {
    claim: async () => {
      const claim = await claimNext({
        store,
        runner: dispatch.runner,
        rules: dispatch.rules(),
        now: dispatch.clock.now(),
        newId: dispatch.newId,
        backoff: dispatch.backoff,
        spawn: dispatch.spawn,
      });

      if (claim === null) {
        throw new Error('the claim picked no item');
      }

      return claim.attempt.item;
    },
    [Symbol.asyncDispose]: () => stack.disposeAsync(),
  };
}
