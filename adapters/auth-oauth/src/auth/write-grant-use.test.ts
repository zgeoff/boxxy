// Copied from atc: packages/mcp/src/auth/write-grant-use.test.ts at commit 4fe647cf.

import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { registerTestCleanup } from '../test-utils/register-test-cleanup.ts';
import { setupTempDir } from '../test-utils/setup-temp-dir.ts';
import { openAuthDatabase } from './open-auth-database.ts';
import { openMCPAuth } from './open-mcp-auth.ts';
import { writeGrantUse } from './write-grant-use.ts';

async function setupTest() {
  const temporaryDirectory = setupTempDir('boxxy-write-grant-use-');

  const store = await openMCPAuth({
    dbPath: join(temporaryDirectory.path, 'mcp-auth.db'),
    openDatabase: openAuthDatabase,
    origin: null,
  });

  registerTestCleanup(() => store.close());

  return { db: store.db };
}

test('it records when a grant was last used', async () => {
  const ctx = await setupTest();

  await writeGrantUse(ctx.db, 'grant-one', Date.UTC(2026, 9, 8, 0, 0, 0));

  const rows = await ctx.db.selectFrom('boxxy_grant_use').selectAll().execute();

  expect(rows).toStrictEqual([{ grant_id: 'grant-one', last_used_at: '2026-10-08T00:00:00.000Z' }]);
});

test('it moves the last-used time of a grant used again', async () => {
  const ctx = await setupTest();

  await writeGrantUse(ctx.db, 'grant-one', Date.UTC(2026, 9, 8, 0, 0, 0));
  await writeGrantUse(ctx.db, 'grant-one', Date.UTC(2026, 9, 9, 0, 0, 0));

  const rows = await ctx.db.selectFrom('boxxy_grant_use').selectAll().execute();

  expect(rows).toStrictEqual([{ grant_id: 'grant-one', last_used_at: '2026-10-09T00:00:00.000Z' }]);
});
