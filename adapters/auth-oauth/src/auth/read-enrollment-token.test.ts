// Copied from atc: packages/mcp/src/auth/read-enrollment-token.test.ts at commit 4fe647cf.

import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { registerTestCleanup } from '../test-utils/register-test-cleanup.ts';
import { setupTempDir } from '../test-utils/setup-temp-dir.ts';
import { createEnrollmentToken } from './create-enrollment-token.ts';
import { deriveTokenHash } from './derive-token-hash.ts';
import { openAuthDatabase } from './open-auth-database.ts';
import { openMCPAuth } from './open-mcp-auth.ts';
import { readEnrollmentToken } from './read-enrollment-token.ts';

// A temp directory that holds an authorization database, opened the way
// the server opens it.
async function setupTest() {
  const temporaryDirectory = setupTempDir('boxxy-find-enrollment-token-');

  const store = await openMCPAuth({
    dbPath: join(temporaryDirectory.path, 'mcp-auth.db'),
    openDatabase: openAuthDatabase,
    origin: null,
  });

  registerTestCleanup(() => store.close());

  return { db: store.db, auth: store.auth };
}

test('it finds the hash of a minted token before it expires', async () => {
  const ctx = await setupTest();
  const minted = await createEnrollmentToken(ctx.db, 1_000_000);
  const found = await readEnrollmentToken(ctx.db, minted.token, 1_000_000 + 899_999);

  expect(found).toBe(deriveTokenHash(minted.token));
});

test('it finds nothing for a token once it expired', async () => {
  const ctx = await setupTest();
  const minted = await createEnrollmentToken(ctx.db, 1_000_000);
  const found = await readEnrollmentToken(ctx.db, minted.token, 1_000_000 + 900_000);

  expect(found).toBeNull();
});

test('it finds nothing for a token it never minted', async () => {
  const ctx = await setupTest();

  await createEnrollmentToken(ctx.db, 1_000_000);

  const found = await readEnrollmentToken(ctx.db, 'boxxy-enroll-guessed', 1_000_000);

  expect(found).toBeNull();
});
