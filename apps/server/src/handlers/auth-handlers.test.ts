import { expect, test } from 'bun:test';
import { z } from 'zod';
import { buildRPCRequest } from '../test-utils/build-rpc-request.ts';
import { createTestServer } from '../test-utils/create-test-server.ts';

async function setupTest(hasPublicDoor: boolean) {
  const server = await createTestServer({ hasPublicDoor });

  return {
    ...server,
    callOwner: async (procedure: string, input: unknown) => {
      const response = await server.owner(buildRPCRequest({ procedure, input }));

      return { status: response.status, body: await response.json() };
    },
  };
}

test('it answers AUTH_NOT_CONFIGURED to every auth procedure on a server with no public door', async () => {
  const ctx = await setupTest(false);
  const answer = await ctx.callOwner('auth.enroll', {});

  expect(answer).toStrictEqual({
    status: 501,
    body: {
      json: {
        defined: true,
        code: 'AUTH_NOT_CONFIGURED',
        message: 'this boxxy server has no public door',
      },
    },
  });
});

test('it answers a link on the public origin for auth.enroll', async () => {
  const ctx = await setupTest(true);
  const answer = await ctx.callOwner('auth.enroll', {});

  expect(answer).toStrictEqual({
    status: 200,
    body: {
      json: {
        token: expect.stringMatching(/^enroll-/u),
        link: expect.stringMatching(/^https:\/\/boxxy\.test\/enroll\?token=enroll-/u),
      },
    },
  });
});

test('it lists a client that auth.addClient added, and drops it for auth.removeClient', async () => {
  const ctx = await setupTest(true);

  const added = await ctx.callOwner('auth.addClient', {
    name: 'Dots',
    redirectURIs: ['https://dots.example/callback'],
  });

  const listed = await ctx.callOwner('auth.listClients', {});

  const client = z.object({ json: z.object({ client: z.string() }) }).parse(added.body).json.client;

  const removed = await ctx.callOwner('auth.removeClient', { client });
  const after = await ctx.callOwner('auth.listClients', {});

  expect({ listed: listed.body, removed: removed.body, after: after.body }).toStrictEqual({
    listed: {
      json: {
        clients: [
          {
            client,
            name: 'Dots',
            redirectURIs: ['https://dots.example/callback'],
            createdAt: expect.any(String),
          },
        ],
      },
    },
    removed: { json: { removed: true } },
    after: { json: { clients: [] } },
  });
});

test('it refuses a redirect URI that is not https or loopback with 400', async () => {
  const ctx = await setupTest(true);

  const answer = await ctx.callOwner('auth.addClient', {
    name: 'Dots',
    redirectURIs: ['http://dots.example/callback'],
  });

  expect(answer.status).toBe(400);
});

test('it answers 409 when auth.addClient names a client that exists', async () => {
  const ctx = await setupTest(true);

  await ctx.callOwner('auth.addClient', {
    name: 'Dots',
    redirectURIs: ['https://dots.example/callback'],
  });

  const answer = await ctx.callOwner('auth.addClient', {
    name: 'Dots',
    redirectURIs: ['https://other.example/callback'],
  });

  expect(answer.status).toBe(409);
});

test('it answers removed false for a client it does not hold', async () => {
  const ctx = await setupTest(true);
  const answer = await ctx.callOwner('auth.removeClient', { client: 'no-such-client' });

  expect(answer.body).toStrictEqual({ json: { removed: false } });
});

test('it answers revoked false for a grant it does not hold', async () => {
  const ctx = await setupTest(true);
  const answer = await ctx.callOwner('auth.revokeGrant', { grant: 'no-such-grant' });

  expect(answer.body).toStrictEqual({ json: { revoked: false } });
});
