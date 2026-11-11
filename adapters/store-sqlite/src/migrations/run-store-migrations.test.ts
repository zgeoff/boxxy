import { expect, onTestFinished, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSQLiteDialect } from '@zgeoff/kysely-bun-sqlite';
import { Kysely } from 'kysely';
import { z } from 'zod';
import type { StoreDatabase } from '../types.ts';
import { createTablesMigration } from './create-tables-migration.ts';
import { renameRelationsMigration } from './rename-relations-migration.ts';
import { runStoreMigrations } from './run-store-migrations.ts';

async function setupTest() {
  const cleanup = new AsyncDisposableStack();

  onTestFinished(() => cleanup.disposeAsync());

  const folder = await mkdtemp(join(tmpdir(), 'boxxy-migrations-'));

  cleanup.defer(() => rm(folder, { recursive: true, force: true }));

  const sqlite = new Database(join(folder, 'store.db'), { create: true });

  cleanup.defer(() => {
    sqlite.close();
  });

  const db = new Kysely<StoreDatabase>({ dialect: buildSQLiteDialect(sqlite) });

  cleanup.defer(() => db.destroy());

  return {
    migrate: () => runStoreMigrations(db),
    createTables: () => createTablesMigration.up(db),
    renameRelations: () => renameRelationsMigration.up(db),
    writeRaw: (statement: string, ...values: number[]) => {
      sqlite.query(statement).run(...values);
    },
    readRaw: (statement: string) => sqlite.query(statement).all(),
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
    'outbox',
    'pool_slots',
    'pull_requests',
    'relations',
    'runners',
  ]);
});

test('it keeps the rows of the links table when it renames the table to relations', async () => {
  const ctx = await setupTest();

  await ctx.createTables();

  ctx.writeRaw(
    "INSERT INTO links (source, target, type, added_by, added_at, removed_at) VALUES ('item-a', 'item-b', 'blocks', 'boxxy:owner:local', ?, NULL)",
    1000,
  );

  await ctx.renameRelations();

  expect(ctx.readRaw('SELECT source, target, type FROM relations')).toStrictEqual([
    { source: 'item-a', target: 'item-b', type: 'blocks' },
  ]);
});

test('it refuses a second live relation of one source, target and type after the rename', async () => {
  const ctx = await setupTest();

  const insert =
    "INSERT INTO relations (source, target, type, added_by, added_at, removed_at) VALUES ('item-a', 'item-b', 'blocks', 'boxxy:owner:local', ?, NULL)";

  await ctx.migrate();

  ctx.writeRaw(insert, 1000);

  expect(() => ctx.writeRaw(insert, 2000)).toThrow(/UNIQUE constraint failed/u);
});

test('it changes nothing when it runs again on a migrated file', async () => {
  const ctx = await setupTest();

  await ctx.migrate();

  const before = { schema: ctx.readSchema(), migrations: ctx.readMigrations() };

  await ctx.migrate();

  expect({ schema: ctx.readSchema(), migrations: ctx.readMigrations() }).toStrictEqual(before);
});
