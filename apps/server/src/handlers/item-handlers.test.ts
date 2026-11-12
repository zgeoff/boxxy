import { expect, test } from 'bun:test';
import type { ItemId } from '@boxxy/model';
import { buildRPCRequest } from '../test-utils/build-rpc-request.ts';
import { createTestServer } from '../test-utils/create-test-server.ts';

async function setupTest() {
  const server = await createTestServer();

  return {
    ...server,
    callOwner: async (procedure: string, input: unknown) => {
      const response = await server.owner(buildRPCRequest({ procedure, input }));

      return { status: response.status, body: await response.json() };
    },
    readItem: (item: ItemId) =>
      server.deps.store.read((tx) =>
        tx.readItem(item, server.dispatch.clock.now(), server.dispatch.rules()),
      ),
  };
}

test('#close closes an item as a duplicate of the item that its live duplicate-of relation names', async () => {
  const ctx = await setupTest();
  const source = await ctx.dispatch.seedItem({});
  const target = await ctx.dispatch.seedItem({});

  await ctx.callOwner('relation.add', { source, target, type: 'duplicate-of' });

  const answer = await ctx.callOwner('item.close', {
    item: source,
    reason: 'duplicate',
    of: target,
  });

  expect(answer).toStrictEqual({ status: 200, body: { json: { item: source, ended: [] } } });

  const item = await ctx.readItem(source);

  expect(item?.closedAt).toBe(ctx.dispatch.clock.now());
});
