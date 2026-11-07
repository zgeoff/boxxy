import { expect, onTestFinished, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSQLiteDialect } from '@zgeoff/kysely-bun-sqlite';
import { Kysely } from 'kysely';
import { z } from 'zod';
import { runStoreMigrations } from './run-store-migrations.ts';
import type { StoreDatabase } from './types.ts';

async function setupTest() {
  const folder = await mkdtemp(join(tmpdir(), 'boxxy-migrations-'));

  onTestFinished(() => rm(folder, { recursive: true, force: true }));

  const sqlite = new Database(join(folder, 'store.db'), { create: true });

  onTestFinished(() => {
    sqlite.close();
  });

  const db = new Kysely<StoreDatabase>({ dialect: buildSQLiteDialect(sqlite) });

  onTestFinished(() => db.destroy());

  return {
    migrate: () => runStoreMigrations(db),
    readSchema: () =>
      z
        .array(z.object({ type: z.string(), name: z.string(), sql: z.string().nullable() }))
        .parse(
          sqlite
            .query(
              "SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name",
            )
            .all(),
        ),
    readMigrations: () =>
      z
        .array(z.object({ name: z.string() }))
        .parse(sqlite.query('SELECT name FROM kysely_migration ORDER BY name').all()),
  };
}

test('it creates every table of the store schema in an empty file', async () => {
  const ctx = await setupTest();

  await ctx.migrate();

  const tables = ctx
    .readSchema()
    .filter((entry) => entry.type === 'table')
    .map((entry) => entry.name);

  expect(tables).toStrictEqual([
    'attempt_sessions',
    'attempts',
    'decisions',
    'evidence',
    'items',
    'kysely_migration',
    'kysely_migration_lock',
    'leases',
    'levers',
    'links',
    'outbox',
    'pool_slots',
    'pull_requests',
    'runners',
  ]);
});

test('it changes nothing when it runs again on a migrated file', async () => {
  const ctx = await setupTest();

  await ctx.migrate();

  const before = { schema: ctx.readSchema(), migrations: ctx.readMigrations() };

  await ctx.migrate();

  expect({ schema: ctx.readSchema(), migrations: ctx.readMigrations() }).toStrictEqual(before);
});
