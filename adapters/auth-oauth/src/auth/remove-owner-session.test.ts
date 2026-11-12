// Copied from atc: packages/mcp/src/auth/remove-owner-session.test.ts at commit 4fe647cf.

import { expect, test } from 'bun:test';
import { join } from 'node:path';
import invariant from 'tiny-invariant';
import { registerTestCleanup } from '../test-utils/register-test-cleanup.ts';
import { setupTempDir } from '../test-utils/setup-temp-dir.ts';
import { openAuthDatabase } from './open-auth-database.ts';
import { openMCPAuth } from './open-mcp-auth.ts';
import { removeOwnerSession } from './remove-owner-session.ts';

async function setupTest() {
  const temporaryDirectory = setupTempDir('boxxy-remove-owner-session-');

  const store = await openMCPAuth({
    dbPath: join(temporaryDirectory.path, 'mcp-auth.db'),
    openDatabase: openAuthDatabase,
    origin: null,
  });

  registerTestCleanup(() => store.close());

  return { db: store.db, auth: store.auth };
}

test('it removes only the owner session it is given', async () => {
  const ctx = await setupTest();

  await ctx.auth.api.signInOwner({ body: {} });
  await ctx.auth.api.signInOwner({ body: {} });

  const [removed, kept] = await ctx.db.selectFrom('session').select('id').execute();

  invariant(removed !== undefined && kept !== undefined, 'the arrangement left no two sessions');

  await removeOwnerSession(ctx.db, removed.id);

  const sessions = await ctx.db.selectFrom('session').select('id').execute();

  expect(sessions).toStrictEqual([{ id: kept.id }]);
});
