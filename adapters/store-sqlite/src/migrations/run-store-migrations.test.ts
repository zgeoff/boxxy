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
import { itemBodyMigration } from './item-body-migration.ts';
import { jobAttemptsMigration } from './job-attempts-migration.ts';
import { noticeKeysMigration } from './notice-keys-migration.ts';
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
    migrateNoticeKeys: () => noticeKeysMigration.up(db),
    migrateItemBody: () => itemBodyMigration.up(db),
    migrateJobAttempts: () => jobAttemptsMigration.up(db),
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
    'notice_session',
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

test('it makes each old notice row due at its own time, on its first key, in the unsent index', async () => {
  const ctx = await setupTest();

  await ctx.createTables();
  await ctx.renameRelations();
  await ctx.migrateV1Tables();

  ctx.writeRaw(
    "INSERT INTO notices (item, reason, at, tries, sent_at) VALUES ('item-a', 'blocked', ?, 7, NULL)",
    1000,
  );

  ctx.writeRaw(
    "INSERT INTO notices (item, reason, at, tries, sent_at) VALUES ('item-b', 'blocked', ?, 1, 2000)",
    1500,
  );

  await ctx.migrateNoticeKeys();

  const index = ctx.readSchema().find((entry) => entry.name === 'notices_unsent')?.sql;

  expect([
    ctx.readRaw('SELECT item, tries, key_seq, key_tries, next_try_at FROM notices ORDER BY id'),
    index,
  ]).toStrictEqual([
    [
      { item: 'item-a', tries: 7, key_seq: 0, key_tries: 0, next_try_at: 1000 },
      { item: 'item-b', tries: 1, key_seq: 0, key_tries: 0, next_try_at: 1500 },
    ],
    'CREATE INDEX notices_unsent ON notices (next_try_at) WHERE sent_at IS NULL',
  ]);
});

test('it refuses a second notice session row', async () => {
  const ctx = await setupTest();

  await ctx.migrate();

  ctx.writeRaw(
    "INSERT INTO notice_session (id, gateway_id, set_at) VALUES (1, 'desk.3.s7', ?)",
    1000,
  );

  expect(() => {
    ctx.writeRaw(
      "INSERT INTO notice_session (id, gateway_id, set_at) VALUES (2, 'desk.4.s2', ?)",
      2000,
    );
  }).toThrow(/CHECK constraint failed/u);
});

test('it gives an item of a version 4 file an empty body, and lets a new item hold one', async () => {
  const ctx = await setupTest();

  await ctx.createTables();
  await ctx.renameRelations();
  await ctx.migrateV1Tables();
  await ctx.migrateNoticeKeys();

  ctx.writeRaw(
    "INSERT INTO items (id, kind, repo, title, outcome, acceptance, fields, labels, filed_by, filed_at) VALUES ('item-a', 'core.issue', 'acme/widgets', 'A title', 'An outcome', '[]', '{}', '[]', 'boxxy:owner:local', ?)",
    1000,
  );

  await ctx.migrateItemBody();

  ctx.writeRaw(
    "INSERT INTO items (id, kind, repo, title, outcome, body, acceptance, fields, labels, filed_by, filed_at) VALUES ('item-b', 'core.issue', 'acme/widgets', 'A title', 'An outcome', '## Context', '[]', '{}', '[]', 'boxxy:owner:local', ?)",
    2000,
  );

  expect(ctx.readRaw('SELECT id, body FROM items ORDER BY id')).toStrictEqual([
    { id: 'item-a', body: '' },
    { id: 'item-b', body: '## Context' },
  ]);
});

test('it gives an attempt of a version 5 file the atc worker and no job columns', async () => {
  const ctx = await setupTest();

  await ctx.createTables();
  await ctx.renameRelations();
  await ctx.migrateV1Tables();
  await ctx.migrateNoticeKeys();
  await ctx.migrateItemBody();

  ctx.writeRaw(
    "INSERT INTO attempts (id, item, phase, number, runner, recipe_hash, rules_version, pool, lease_gen, spawn_request, spawn_request_hash, state, claimed_at, fields, mode, round, hold_gen) VALUES ('attempt-a', 'item-a', 'build', 1, 'runner-1', 'hash-a', 'rules-a', 'build', 1, '{}', 'hash-b', 'running', ?, '{}', 'agent', 1, 1)",
    1000,
  );

  await ctx.migrateJobAttempts();

  expect(
    ctx.readRaw(
      'SELECT worker, acted_at, acted_head, acted_answer, read_at, wait_reason FROM attempts',
    ),
  ).toStrictEqual([
    {
      worker: 'atc.session',
      acted_at: null,
      acted_head: null,
      acted_answer: null,
      read_at: null,
      wait_reason: null,
    },
  ]);
});
