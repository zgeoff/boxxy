import { expect, test } from 'bun:test';
import type { PepysReader } from '@boxxy/model';
import { buildRPCRequest } from '../test-utils/build-rpc-request.ts';
import { createTestServer } from '../test-utils/create-test-server.ts';

async function setupTest() {
  const brokenPepys: PepysReader = {
    readCostToLand: () =>
      Promise.reject(new Error('the read failed', { cause: new Error('disk I/O error') })),
    readStageTime: () => Promise.reject(new Error('the read failed')),
  };

  const server = await createTestServer({ pepys: brokenPepys });

  return {
    ...server,
    callOwner: async (procedure: string, input: unknown) => {
      const response = await server.owner(buildRPCRequest({ procedure, input }));

      return response.status;
    },
  };
}

test('it logs a call that fails with an internal error, with its procedure, item and cause', async () => {
  const ctx = await setupTest();
  const item = await ctx.dispatch.seedItem({});
  const status = await ctx.callOwner('report.cost', { item });

  expect([status, ctx.logged]).toStrictEqual([
    500,
    [
      {
        message: 'a call failed with an internal error',
        fields: {
          procedure: 'report.cost',
          item,
          error: 'Error: the read failed (cause: Error: disk I/O error)',
        },
      },
    ],
  ]);
});

test('it logs nothing for a call that fails with a typed error', async () => {
  const ctx = await setupTest();
  const status = await ctx.callOwner('item.get', { item: 'i-404' });

  expect([status, ctx.logged]).toStrictEqual([404, []]);
});
