// Copied from atc: packages/mcp/src/auth/update-passkey-use.test.ts at commit 4fe647cf.

import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { buildSeeder } from '../test-utils/build-seeder.ts';
import { buildStubClock } from '../test-utils/build-stub-clock.ts';
import { registerTestCleanup } from '../test-utils/register-test-cleanup.ts';
import { setupTempDir } from '../test-utils/setup-temp-dir.ts';
import { openAuthDatabase } from './open-auth-database.ts';
import { openMCPAuth } from './open-mcp-auth.ts';
import { updatePasskeyUse } from './update-passkey-use.ts';

// A temp directory that holds an authorization database, opened the way
// the server opens it.
async function setupTest() {
  const temporaryDirectory = setupTempDir('boxxy-update-passkey-use-');

  const store = await openMCPAuth({
    dbPath: join(temporaryDirectory.path, 'mcp-auth.db'),
    openDatabase: openAuthDatabase,
    origin: null,
  });

  registerTestCleanup(() => store.close());

  const deps = { db: store.db, clock: buildStubClock(Date.UTC(2026, 9, 14, 12, 0, 0)) };

  return { ...deps, seed: buildSeeder(deps) };
}

test('it stores the new counter and the time of the use', async () => {
  const ctx = await setupTest();

  await ctx.seed.passkey({ id: 'cred-phone', counter: 4 });

  const stored = await updatePasskeyUse(ctx.db, {
    id: 'cred-phone',
    counter: 4,
    newCounter: 5,
    now: Date.UTC(2026, 9, 14, 13, 0, 0),
  });

  expect(stored).toBeTrue();

  expect(
    ctx.db.selectFrom('boxxy_passkey').select(['counter', 'last_used_at']).execute(),
  ).resolves.toStrictEqual([{ counter: 5, last_used_at: '2026-10-14T13:00:00.000Z' }]);
});

test('it stores nothing when the passkey holds another counter than the verification read', async () => {
  const ctx = await setupTest();

  await ctx.seed.passkey({ id: 'cred-phone', counter: 6 });

  const stored = await updatePasskeyUse(ctx.db, {
    id: 'cred-phone',
    counter: 4,
    newCounter: 5,
    now: Date.UTC(2026, 9, 14, 13, 0, 0),
  });

  expect(stored).toBeFalse();

  expect(
    ctx.db.selectFrom('boxxy_passkey').select(['counter', 'last_used_at']).execute(),
  ).resolves.toStrictEqual([{ counter: 6, last_used_at: null }]);
});

test('it stores nothing for a passkey that is no longer enrolled', async () => {
  const ctx = await setupTest();

  expect(
    updatePasskeyUse(ctx.db, { id: 'cred-gone', counter: 0, newCounter: 1, now: 0 }),
  ).resolves.toBeFalse();
});
