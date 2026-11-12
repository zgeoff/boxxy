import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { openAuthDatabase } from '../auth/open-auth-database.ts';
import { openMCPAuth } from '../auth/open-mcp-auth.ts';
import { registerTestCleanup } from './register-test-cleanup.ts';
import { seedPasskey } from './seed-passkey.ts';
import { setupTempDir } from './setup-temp-dir.ts';

async function setupTest() {
  const temporaryDirectory = setupTempDir('boxxy-seed-passkey-');

  const store = await openMCPAuth({
    dbPath: join(temporaryDirectory.path, 'auth.db'),
    openDatabase: openAuthDatabase,
    origin: null,
  });

  registerTestCleanup(() => store.close());

  return { db: store.db, clock: { now: () => Date.UTC(2026, 10, 13, 9, 0, 0) } };
}

test('it stores one passkey and spends the enrollment token it used', async () => {
  const ctx = await setupTest();

  await seedPasskey(ctx);

  const passkeys = await ctx.db.selectFrom('boxxy_passkey').select('id').execute();
  const tokens = await ctx.db.selectFrom('boxxy_enrollment_token').selectAll().execute();

  expect({ passkeys, tokens }).toStrictEqual({ passkeys: [{ id: 'credential-0001' }], tokens: [] });
});

test('it stores the id and counter that the input overrides', async () => {
  const ctx = await setupTest();

  await seedPasskey(ctx, { id: 'cred-phone', counter: 4 });

  const passkeys = await ctx.db.selectFrom('boxxy_passkey').select(['id', 'counter']).execute();

  expect(passkeys).toStrictEqual([{ id: 'cred-phone', counter: 4 }]);
});
