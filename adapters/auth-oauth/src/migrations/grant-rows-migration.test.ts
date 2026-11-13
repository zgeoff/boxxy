import { expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { join } from 'node:path';
import { createPublicDoor } from '../http/create-public-door.ts';
import { registerTestCleanup } from '../test-utils/register-test-cleanup.ts';
import { seedPrePackageAuth } from '../test-utils/seed-pre-package-auth.ts';
import type { PrePackageAuth } from '../test-utils/seed-pre-package-auth.ts';
import { setupTempDir } from '../test-utils/setup-temp-dir.ts';

function setupTest() {
  const folder = setupTempDir('boxxy-grant-migration-');
  const dbPath = join(folder.path, 'auth.db');
  const origin = 'https://boxxy.example';

  return {
    origin,
    seed: {
      oldAuth: (input: Omit<PrePackageAuth, 'origin'>) => {
        const sqlite = new Database(dbPath, { create: true });

        const grants = seedPrePackageAuth(sqlite, { origin, ...input });

        sqlite.close();

        return grants;
      },
    },

    // A refresh that narrowed the scopes can leave a live access token with no live refresh token.
    expireRefreshTokens: () => {
      const sqlite = new Database(dbPath);

      sqlite.run('UPDATE oauthRefreshToken SET expiresAt = ?', [
        new Date(Date.now() - 1000).toISOString(),
      ]);

      sqlite.close();
    },

    // A row the migration leaves as it is, whose key points at no row, fails its foreign key check.
    writeDanglingRow: () => {
      const sqlite = new Database(dbPath);

      sqlite.run(
        `INSERT INTO oauthClientResource (id, clientId, resourceId) VALUES ('dangling', 'no-such-client', 'no-such-resource')`,
      );

      sqlite.close();
    },
    readOldRows: () => {
      const sqlite = new Database(dbPath, { readonly: true });

      registerTestCleanup(() => {
        sqlite.close();
      });

      return {
        users: sqlite.query('SELECT id FROM "user"').all(),
        grantUses: sqlite.query('SELECT grant_id FROM boxxy_grant_use').all(),
      };
    },
    openDoor: async () => {
      const door = await createPublicDoor({
        publicURL: origin,
        hostname: '127.0.0.1',
        dbPath,
        trustForwardedFrom: [],
        writeSecurityLine: () => {},
        onSweepError: (error) => {
          throw error;
        },
        readPeer: () => '127.0.0.1',
        serveMCP: () => Promise.resolve(new Response('served')),
      });

      registerTestCleanup(() => door.stop());

      return door;
    },
    readForeignKeyFaults: () => {
      const sqlite = new Database(dbPath, { readonly: true });

      registerTestCleanup(() => {
        sqlite.close();
      });

      return sqlite.query('PRAGMA foreign_key_check').all();
    },
  };
}

test('it verifies the access token of each grant after the migration, one of them refreshed', async () => {
  const ctx = setupTest();

  const [first, refreshed] = ctx.seed.oldAuth({
    grants: [
      { clientName: 'Alpha assistant', scopes: ['read'], refreshes: 0, lastUsedAt: null },
      { clientName: 'Beta assistant', scopes: ['read', 'write'], refreshes: 2, lastUsedAt: null },
    ],
    passkeyID: 'passkey-1',
    now: Date.now(),
  });

  const door = await ctx.openDoor();

  const verified: unknown = await Promise.all([
    door.auth.verify(first?.accessToken ?? ''),
    door.auth.verify(refreshed?.accessToken ?? ''),
  ]);

  // The IDs are tagged strings, which compare equal to the plain ones the seed gave.
  expect(verified).toStrictEqual([
    {
      kind: 'oauth',
      grantID: first?.grantID,
      clientID: first?.clientID,
      clientName: 'Alpha assistant',
      scopes: ['read'],
      limits: null,
    },
    {
      kind: 'oauth',
      grantID: refreshed?.grantID,
      clientID: refreshed?.clientID,
      clientName: 'Beta assistant',
      scopes: ['read', 'write'],
      limits: null,
    },
  ]);
});

test('it ends a migrated grant on revoke and keeps the other grant', async () => {
  const ctx = setupTest();

  const [kept, revoked] = ctx.seed.oldAuth({
    grants: [
      { clientName: 'Alpha assistant', scopes: ['read'], refreshes: 0, lastUsedAt: null },
      { clientName: 'Beta assistant', scopes: ['read'], refreshes: 1, lastUsedAt: null },
    ],
    passkeyID: 'passkey-1',
    now: Date.now(),
  });

  const door = await ctx.openDoor();

  await door.admin.revokeGrant(revoked?.grantID ?? '');

  const verified: unknown = await Promise.all([
    door.auth.verify(revoked?.accessToken ?? ''),
    door.auth.verify(kept?.accessToken ?? ''),
  ]);

  expect(verified).toStrictEqual([
    null,
    {
      kind: 'oauth',
      grantID: kept?.grantID,
      clientID: kept?.clientID,
      clientName: 'Alpha assistant',
      scopes: ['read'],
      limits: null,
    },
  ]);
});

test('it lists each migrated grant with the last use the old table held', async () => {
  const ctx = setupTest();

  const [used, unused] = ctx.seed.oldAuth({
    grants: [
      {
        clientName: 'Alpha assistant',
        scopes: ['read'],
        refreshes: 0,
        lastUsedAt: '2026-11-10T08:00:00.000Z',
      },
      { clientName: 'Beta assistant', scopes: ['write'], refreshes: 1, lastUsedAt: null },
    ],
    passkeyID: 'passkey-1',
    now: Date.now(),
  });

  const door = await ctx.openDoor();
  const grants = await door.admin.listGrants();

  expect(grants).toIncludeSameMembers([
    {
      grantID: used?.grantID,
      clientID: used?.clientID,
      clientName: 'Alpha assistant',
      scopes: ['read'],
      createdAt: expect.any(String),
      lastUsedAt: '2026-11-10T08:00:00.000Z',
    },
    {
      grantID: unused?.grantID,
      clientID: unused?.clientID,
      clientName: 'Beta assistant',
      scopes: ['write'],
      createdAt: expect.any(String),
      lastUsedAt: null,
    },
  ]);
});

test('it drops a grant whose tokens had all expired', async () => {
  const ctx = setupTest();

  const [live] = ctx.seed.oldAuth({
    grants: [
      { clientName: 'Alpha assistant', scopes: ['read'], refreshes: 0, lastUsedAt: null },
      {
        clientName: 'Beta assistant',
        scopes: ['read'],
        refreshes: 1,
        lastUsedAt: null,
        isExpired: true,
      },
    ],
    passkeyID: 'passkey-1',
    now: Date.now(),
  });

  const door = await ctx.openDoor();
  const grants = await door.admin.listGrants();

  expect(grants.map((grant) => grant.grantID)).toStrictEqual([live?.grantID ?? '']);
});

test('it keeps the passkeys the owner enrolled before the migration', async () => {
  const ctx = setupTest();

  ctx.seed.oldAuth({
    grants: [{ clientName: 'Alpha assistant', scopes: ['read'], refreshes: 0, lastUsedAt: null }],
    passkeyID: 'passkey-kept',
    now: Date.now(),
  });

  const door = await ctx.openDoor();
  const passkeys = await door.auth.passkeys.list();

  const ids: unknown = passkeys.map((passkey) => passkey.id);

  expect(ids).toStrictEqual(['passkey-kept']);
});

test('it refreshes a migrated grant with its newest refresh token', async () => {
  const ctx = setupTest();

  const [grant] = ctx.seed.oldAuth({
    grants: [{ clientName: 'Beta assistant', scopes: ['read'], refreshes: 1, lastUsedAt: null }],
    passkeyID: 'passkey-1',
    now: Date.now(),
  });

  const door = await ctx.openDoor();

  const response = await door.answerRequest(
    new Request(`${ctx.origin}/oauth2/token`, {
      method: 'POST',
      headers: {
        host: 'boxxy.example',
        origin: ctx.origin,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: grant?.refreshToken ?? '',
        client_id: grant?.clientID ?? '',
      }),
    }),
  );

  expect(response.status).toBe(200);
});

test('it leaves no foreign key that points at no row', async () => {
  const ctx = setupTest();

  ctx.seed.oldAuth({
    grants: [
      { clientName: 'Alpha assistant', scopes: ['read'], refreshes: 0, lastUsedAt: null },
      { clientName: 'Beta assistant', scopes: ['read'], refreshes: 1, lastUsedAt: null },
    ],
    passkeyID: 'passkey-1',
    now: Date.now(),
  });

  const door = await ctx.openDoor();

  await door.stop();

  expect(ctx.readForeignKeyFaults()).toStrictEqual([]);
});

test('it opens a new database, and opens it again once it holds the tables', async () => {
  const ctx = setupTest();

  const first = await ctx.openDoor();

  await first.stop();

  const door = await ctx.openDoor();

  expect(door.auth.resource).toBe('https://boxxy.example/mcp');
});

test('it refuses to remove a migrated client whose name another client shares', async () => {
  const ctx = setupTest();

  const [first] = ctx.seed.oldAuth({
    grants: [
      { clientName: 'Alpha assistant', scopes: ['read'], refreshes: 0, lastUsedAt: null },
      { clientName: 'Alpha assistant', scopes: ['read'], refreshes: 0, lastUsedAt: null },
    ],
    passkeyID: 'passkey-1',
    now: Date.now(),
  });

  const door = await ctx.openDoor();
  const answer = await door.admin.removeClient(first?.clientID ?? '');

  expect(answer).toStrictEqual({ kind: 'ambiguous', name: 'Alpha assistant' });
});

test('it revokes a migrated grant whose refresh token expired while its access token lives', async () => {
  const ctx = setupTest();

  const [grant] = ctx.seed.oldAuth({
    grants: [{ clientName: 'Alpha assistant', scopes: ['read'], refreshes: 0, lastUsedAt: null }],
    passkeyID: 'passkey-1',
    now: Date.now(),
  });

  ctx.expireRefreshTokens();

  const door = await ctx.openDoor();

  await door.admin.revokeGrant(grant?.grantID ?? '');

  const access = await door.auth.verify(grant?.accessToken ?? '');

  expect(access).toBeNull();
});

test('it rolls the whole migration back when its foreign key check fails', async () => {
  const ctx = setupTest();

  ctx.seed.oldAuth({
    grants: [
      {
        clientName: 'Alpha assistant',
        scopes: ['read'],
        refreshes: 0,
        lastUsedAt: '2026-11-10T08:00:00.000Z',
      },
    ],
    passkeyID: 'passkey-1',
    now: Date.now(),
  });

  ctx.writeDanglingRow();

  await ctx.openDoor().catch(() => null);

  expect(ctx.readOldRows()).toStrictEqual({
    users: [{ id: 'owner-user-row' }],
    grantUses: [{ grant_id: 'code-0' }],
  });
});
