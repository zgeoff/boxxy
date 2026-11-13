import { expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { seedPrePackageAuth } from './seed-pre-package-auth.ts';

function setupTest() {
  const sqlite = new Database(':memory:');

  return {
    sqlite,
    readTokenOwners: () =>
      sqlite
        .query(
          'SELECT userId, authorizationCodeId, revoked IS NOT NULL AS isRevoked FROM oauthRefreshToken ORDER BY id',
        )
        .all(),
  };
}

test('it points every token of each grant at the one owner row, and rotates out all but the newest refresh token', () => {
  const ctx = setupTest();

  seedPrePackageAuth(ctx.sqlite, {
    origin: 'https://boxxy.example',
    grants: [{ clientName: 'Alpha assistant', scopes: ['read'], refreshes: 1, lastUsedAt: null }],
    passkeyID: 'passkey-1',
    now: Date.UTC(2026, 10, 13),
  });

  expect(ctx.readTokenOwners()).toStrictEqual([
    { userId: 'owner-user-row', authorizationCodeId: 'code-0', isRevoked: 1 },
    { userId: 'owner-user-row', authorizationCodeId: 'code-0', isRevoked: 0 },
  ]);
});

test('it answers the IDs and the newest tokens of each grant', () => {
  const ctx = setupTest();

  const grants = seedPrePackageAuth(ctx.sqlite, {
    origin: 'https://boxxy.example',
    grants: [{ clientName: 'Alpha assistant', scopes: ['read'], refreshes: 2, lastUsedAt: null }],
    passkeyID: 'passkey-1',
    now: Date.UTC(2026, 10, 13),
  });

  expect(grants).toStrictEqual([
    {
      grantID: 'code-0',
      clientID: 'client-0',
      accessToken: 'access-token-code-0-2',
      refreshToken: 'refresh-token-code-0-2',
    },
  ]);
});

test('it writes the last use of a grant to the grant-use table', () => {
  const ctx = setupTest();

  seedPrePackageAuth(ctx.sqlite, {
    origin: 'https://boxxy.example',
    grants: [
      {
        clientName: 'Alpha assistant',
        scopes: ['read'],
        refreshes: 0,
        lastUsedAt: '2026-11-10T08:00:00.000Z',
      },
    ],
    passkeyID: 'passkey-1',
    now: Date.UTC(2026, 10, 13),
  });

  expect(
    ctx.sqlite.query('SELECT grant_id, last_used_at FROM boxxy_grant_use').all(),
  ).toStrictEqual([{ grant_id: 'code-0', last_used_at: '2026-11-10T08:00:00.000Z' }]);
});
