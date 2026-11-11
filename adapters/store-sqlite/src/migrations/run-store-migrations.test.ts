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
import { v1TablesMigration } from './v1-tables-migration.ts';

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
    migrateV1Tables: () => v1TablesMigration.up(db),
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
    'limit_seats',
    'limits',
    'notes',
    'notices',
    'outbox',
    'pull_requests',
    'relations',
    'runners',
  ]);
});

test('it refuses to rebuild the v1 tables over a file that holds a slice 1 fact', async () => {
  const ctx = await setupTest();

  await ctx.createTables();
  await ctx.renameRelations();

  ctx.writeRaw(
    "INSERT INTO outbox (fact_id, type, entity, actor, at, payload, sent_at) VALUES ('0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b70', 'boxxy.item.filed', 'boxxy:item:item-a', 'boxxy:owner:local', ?, '{}', NULL)",
    1000,
  );

  const migrated = await ctx.migrateV1Tables().then(
    () => 'migrated',
    () => 'refused',
  );

  expect({ migrated, outbox: ctx.readRaw('SELECT seq FROM outbox') }).toStrictEqual({
    migrated: 'refused',
    outbox: [{ seq: 1 }],
  });
});

test('it refuses a second held seat of one limit, attempt and hold gen', async () => {
  const ctx = await setupTest();

  const insert =
    "INSERT INTO limit_seats (\"limit\", attempt, hold_gen, over_cap, taken_at, released_at) VALUES ('workers', 'attempt-a', 1, 0, ?, NULL)";

  await ctx.migrate();

  ctx.writeRaw(insert, 1000);

  expect(() => {
    ctx.writeRaw(insert, 2000);
  }).toThrow(/UNIQUE constraint failed/u);
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

  expect(() => {
    ctx.writeRaw(insert, 2000);
  }).toThrow(/UNIQUE constraint failed/u);
});

test('it changes nothing when it runs again on a migrated file', async () => {
  const ctx = await setupTest();

  await ctx.migrate();

  const before = { schema: ctx.readSchema(), migrations: ctx.readMigrations() };

  await ctx.migrate();

  expect({ schema: ctx.readSchema(), migrations: ctx.readMigrations() }).toStrictEqual(before);
});
