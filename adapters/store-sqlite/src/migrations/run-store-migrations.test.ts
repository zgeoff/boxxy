import { expect, onTestFinished, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSQLiteDialect } from '@zgeoff/kysely-bun-sqlite';
import { Kysely } from 'kysely';
import { z } from 'zod';
import type { StoreDatabase } from '../types.ts';
import { capacityRefusalsMigration } from './capacity-refusals-migration.ts';
import { createTablesMigration } from './create-tables-migration.ts';
import { evidenceHeadMigration } from './evidence-head-migration.ts';
import { itemBodyMigration } from './item-body-migration.ts';
import { itemRefMigration } from './item-ref-migration.ts';
import { jobAttemptsMigration } from './job-attempts-migration.ts';
import { leverHeadMigration } from './lever-head-migration.ts';
import { noticeKeysMigration } from './notice-keys-migration.ts';
import { refusalMigration } from './refusal-migration.ts';
import { renameRelationsMigration } from './rename-relations-migration.ts';
import { runStoreMigrations } from './run-store-migrations.ts';
import { runnerPauseMigration } from './runner-pause-migration.ts';
import { shipWatchMigration } from './ship-watch-migration.ts';
import { skippedAttemptsMigration } from './skipped-attempts-migration.ts';
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
    migrateRunnerPause: () => runnerPauseMigration.up(db),
    migrateRefusal: () => refusalMigration.up(db),
    migrateSkippedAttempts: () => skippedAttemptsMigration.up(db),
    migrateShipWatch: () => shipWatchMigration.up(db),
    migrateLeverHead: () => leverHeadMigration.up(db),
    migrateItemRef: () => itemRefMigration.up(db),
    migrateEvidenceHead: () => evidenceHeadMigration.up(db),
    migrateCapacityRefusals: () => capacityRefusalsMigration.up(db),
    writeRaw: (statement: string, ...values: (number | string)[]) => {
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
    'capacity_refusals',
    'decisions',
    'evidence',
    'item_shipped',
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
    'wait_notices',
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

test('it keeps each old notice as a hold notice and the runner row as it was, with no pause recorded', async () => {
  const ctx = await setupTest();

  await ctx.createTables();
  await ctx.renameRelations();
  await ctx.migrateV1Tables();
  await ctx.migrateNoticeKeys();

  ctx.writeRaw(
    "INSERT INTO notices (item, reason, at, tries, sent_at, key_seq, key_tries, next_try_at) VALUES ('item-a', 'blocked', ?, 7, NULL, 2, 1, 3000)",
    1000,
  );

  ctx.writeRaw("INSERT INTO runners (id, heartbeat_at, paused) VALUES ('runner-1', ?, 1)", 1500);

  await ctx.migrateRunnerPause();

  const index = ctx.readSchema().find((entry) => entry.name === 'notices_unsent')?.sql;

  expect([
    ctx.readRaw(
      'SELECT id, kind, item, reason, pause, tries, key_seq, key_tries, next_try_at FROM notices',
    ),
    ctx.readRaw(
      'SELECT id, paused, paused_at, paused_by, pause_reason, pause_noticed_at FROM runners',
    ),
    index,
  ]).toStrictEqual([
    [
      {
        id: 1,
        kind: 'hold',
        item: 'item-a',
        reason: 'blocked',
        pause: null,
        tries: 7,
        key_seq: 2,
        key_tries: 1,
        next_try_at: 3000,
      },
    ],
    [
      {
        id: 'runner-1',
        paused: 1,
        paused_at: null,
        paused_by: null,
        pause_reason: null,
        pause_noticed_at: null,
      },
    ],
    'CREATE INDEX notices_unsent ON notices (next_try_at) WHERE sent_at IS NULL',
  ]);
});

test('it lets a paused-runner notice hold no item', async () => {
  const ctx = await setupTest();

  await ctx.migrate();

  ctx.writeRaw(
    "INSERT INTO notices (kind, pause, at, tries) VALUES ('runner-paused', '{}', ?, 0)",
    1000,
  );

  expect(ctx.readRaw('SELECT kind, item, reason FROM notices')).toStrictEqual([
    { kind: 'runner-paused', item: null, reason: null },
  ]);
});

test("it gives an attempt stored before atc's refusal was kept a null refusal", async () => {
  const ctx = await setupTest();

  await ctx.createTables();
  await ctx.renameRelations();
  await ctx.migrateV1Tables();
  await ctx.migrateNoticeKeys();
  await ctx.migrateItemBody();
  await ctx.migrateJobAttempts();

  ctx.writeRaw(
    "INSERT INTO attempts (id, item, phase, number, runner, recipe_hash, rules_version, pool, lease_gen, spawn_request, spawn_request_hash, state, failure, claimed_at, fields, mode, round, hold_gen) VALUES ('attempt-a', 'item-a', 'build', 1, 'runner-1', 'hash-a', 'rules-a', 'build', 1, '{}', 'hash-b', 'failed', 'no-capacity', ?, '{}', 'agent', 1, 1)",
    1000,
  );

  await ctx.migrateRefusal();

  expect(ctx.readRaw('SELECT failure, refusal FROM attempts')).toStrictEqual([
    { failure: 'no-capacity', refusal: null },
  ]);
});

test('it keeps each attempt of an older file and lets a new one hold no pool or spawn request', async () => {
  const ctx = await setupTest();

  await ctx.createTables();
  await ctx.renameRelations();
  await ctx.migrateV1Tables();
  await ctx.migrateNoticeKeys();
  await ctx.migrateItemBody();
  await ctx.migrateJobAttempts();
  await ctx.migrateRefusal();

  ctx.writeRaw(
    "INSERT INTO attempts (id, item, phase, number, runner, recipe_hash, rules_version, pool, lease_gen, spawn_request, spawn_request_hash, state, failure, claimed_at, fields, mode, round, hold_gen) VALUES ('attempt-a', 'item-a', 'build', 1, 'runner-1', 'hash-a', 'rules-a', 'build', 1, '{}', 'hash-b', 'failed', 'no-capacity', ?, '{}', 'agent', 1, 1)",
    1000,
  );

  await ctx.migrateSkippedAttempts();

  ctx.writeRaw(
    "INSERT INTO attempts (id, item, phase, number, runner, recipe_hash, rules_version, lease_gen, state, claimed_at, fields, mode, round, hold_gen, worker, skip_reason) VALUES ('attempt-b', 'item-a', 'verify', 1, 'runner-1', 'hash-a', 'rules-a', 0, 'succeeded', ?, '{}', 'agent', 1, 1, 'skip', 'check-passed:verify / gate')",
    2000,
  );

  expect(
    ctx.readRaw(
      'SELECT id, pool, spawn_request, spawn_request_hash, worker, skip_reason FROM attempts ORDER BY id',
    ),
  ).toStrictEqual([
    {
      id: 'attempt-a',
      pool: 'build',
      spawn_request: '{}',
      spawn_request_hash: 'hash-b',
      worker: 'atc.session',
      skip_reason: null,
    },
    {
      id: 'attempt-b',
      pool: null,
      spawn_request: null,
      spawn_request_hash: null,
      worker: 'skip',
      skip_reason: 'check-passed:verify / gate',
    },
  ]);
});

test('it keeps the index on the atc session of the attempts after the rebuild', async () => {
  const ctx = await setupTest();

  await ctx.migrate();

  expect(ctx.readSchema().filter((entry) => entry.name === 'attempts_atc_session').length).toBe(1);
});

test('it keeps a stored notice and gives the notices table a phase column that reads null', async () => {
  const ctx = await setupTest();

  await ctx.createTables();
  await ctx.renameRelations();
  await ctx.migrateV1Tables();
  await ctx.migrateNoticeKeys();
  await ctx.migrateRunnerPause();

  ctx.writeRaw(
    "INSERT INTO notices (item, reason, at, tries, kind) VALUES ('item-a', 'declined', ?, 0, 'hold')",
    1000,
  );

  await ctx.migrateShipWatch();

  expect(ctx.readRaw('SELECT item, kind, phase FROM notices')).toStrictEqual([
    { item: 'item-a', kind: 'hold', phase: null },
  ]);
});

test('it refuses a second shipped row for one item and commit', async () => {
  const ctx = await setupTest();

  await ctx.migrate();

  const insert =
    "INSERT INTO item_shipped (item_id, \"commit\", rule, ref, seen_at) VALUES ('item-a', 'abc', 'release', 'v1', ?)";

  ctx.writeRaw(insert, 1000);

  expect(() => {
    ctx.writeRaw(insert, 2000);
  }).toThrow(/UNIQUE/u);
});

test('it adds the wait notice table with one row for each item and stay', async () => {
  const ctx = await setupTest();

  await ctx.migrate();

  const insert = "INSERT INTO wait_notices (item_id, since, noticed_at) VALUES ('item-a', 1000, ?)";

  ctx.writeRaw(insert, 2000);

  ctx.writeRaw(
    "INSERT INTO wait_notices (item_id, since, noticed_at) VALUES ('item-a', 3000, 4000)",
  );

  expect(() => {
    ctx.writeRaw(insert, 5000);
  }).toThrow(/UNIQUE/u);
});

test('it keeps a stored lever and gives the levers table a head column that reads null', async () => {
  const ctx = await setupTest();

  await ctx.createTables();
  await ctx.renameRelations();
  await ctx.migrateV1Tables();

  ctx.writeRaw(
    "INSERT INTO levers (kind, item, actor, at) VALUES ('item.retry', 'item-a', 'boxxy:owner:local', ?)",
    1000,
  );

  await ctx.migrateLeverHead();

  ctx.writeRaw(
    "INSERT INTO levers (kind, item, head, actor, at) VALUES ('signoff.approve', 'item-a', 'abc123', 'boxxy:owner:local', ?)",
    2000,
  );

  expect(ctx.readRaw('SELECT kind, head FROM levers ORDER BY seq')).toStrictEqual([
    { kind: 'item.retry', head: null },
    { kind: 'signoff.approve', head: 'abc123' },
  ]);
});

test('it numbers the stored items from 1 in filing order, and refuses a repeated number', async () => {
  const ctx = await setupTest();

  await ctx.createTables();
  await ctx.renameRelations();
  await ctx.migrateV1Tables();
  await ctx.migrateNoticeKeys();
  await ctx.migrateItemBody();

  const insert =
    "INSERT INTO items (id, kind, repo, title, outcome, acceptance, fields, labels, filed_by, filed_at) VALUES (?, 'core.issue', 'acme/widgets', 'A title', 'An outcome', '[]', '{}', '[]', 'boxxy:owner:local', ?)";

  ctx.writeRaw(insert, 'item-c', 3000);
  ctx.writeRaw(insert, 'item-b', 1000);
  ctx.writeRaw(insert, 'item-a', 1000);

  await ctx.migrateItemRef();

  expect(ctx.readRaw('SELECT id, ref FROM items ORDER BY ref')).toStrictEqual([
    { id: 'item-a', ref: 1 },
    { id: 'item-b', ref: 2 },
    { id: 'item-c', ref: 3 },
  ]);

  expect(() => {
    ctx.writeRaw("UPDATE items SET ref = 1 WHERE id = 'item-c'");
  }).toThrow(/UNIQUE/u);
});

test('it keeps a stored evidence row and gives the evidence table a head column that reads null', async () => {
  const ctx = await setupTest();

  await ctx.createTables();

  ctx.writeRaw(
    "INSERT INTO evidence (fact_id, attempt, kind, ref, observed, source, at) VALUES ('fact-a', 'attempt-a', 'test', 'bun test', 'pass', 'agent', ?)",
    1000,
  );

  await ctx.migrateEvidenceHead();

  ctx.writeRaw(
    "INSERT INTO evidence (fact_id, attempt, kind, ref, observed, source, at, head) VALUES ('fact-b', 'attempt-a', 'check', 'pr / checks@abc123', NULL, 'agent', ?, 'abc123')",
    2000,
  );

  expect(ctx.readRaw('SELECT fact_id, head FROM evidence ORDER BY at')).toStrictEqual([
    { fact_id: 'fact-a', head: null },
    { fact_id: 'fact-b', head: 'abc123' },
  ]);
});

test('it refuses a second evidence row with the same attempt, kind and ref', async () => {
  const ctx = await setupTest();

  await ctx.migrate();

  const insert =
    "INSERT INTO evidence (fact_id, attempt, kind, ref, observed, source, at, head) VALUES (?, 'attempt-a', 'check', ?, NULL, 'agent', 1000, ?)";

  ctx.writeRaw(insert, 'fact-a', 'pr / checks@abc123', 'abc123');

  expect(() => {
    ctx.writeRaw(insert, 'fact-b', 'pr / checks@abc123', 'abc123');
  }).toThrow(/UNIQUE/u);
});

test('it moves each no-capacity attempt into the capacity refusals and leaves the other attempts', async () => {
  const ctx = await setupTest();

  await ctx.createTables();
  await ctx.renameRelations();
  await ctx.migrateV1Tables();
  await ctx.migrateNoticeKeys();
  await ctx.migrateItemBody();
  await ctx.migrateJobAttempts();
  await ctx.migrateRefusal();
  await ctx.migrateSkippedAttempts();

  const insertAttempt =
    "INSERT INTO attempts (id, item, phase, number, runner, recipe_hash, rules_version, pool, lease_gen, spawn_request, spawn_request_hash, state, failure, claimed_at, ended_at, fields, mode, round, hold_gen, refusal) VALUES (?, 'item-a', 'build', ?, 'runner-1', 'hash-a', 'rules-a', 'build', ?, '{}', 'hash-b', 'failed', ?, ?, ?, '{}', 'agent', 1, 1, ?)";

  const refusal = '{"code":"host_unavailable","problem":null,"message":"no room"}';

  ctx.writeRaw(insertAttempt, 'attempt-a', 1, 1, 'no-capacity', 1000, 1100, refusal);
  ctx.writeRaw(insertAttempt, 'attempt-b', 2, 2, 'stalled', 2000, 2100, refusal);
  ctx.writeRaw(insertAttempt, 'attempt-c', 3, 3, 'no-capacity', 3000, 3100, refusal);

  for (const [attempt, gen] of [
    ['attempt-a', 1],
    ['attempt-b', 2],
    ['attempt-c', 3],
  ] as const) {
    ctx.writeRaw(
      "INSERT INTO leases (item, phase, attempt, gen, taken_at, released_at) VALUES ('item-a', 'build', ?, ?, 1, 2)",
      attempt,
      gen,
    );

    ctx.writeRaw(
      'INSERT INTO limit_seats ("limit", attempt, hold_gen, over_cap, taken_at, released_at) VALUES (\'build\', ?, 1, 0, 1, 2)',
      attempt,
    );
  }

  await ctx.migrateCapacityRefusals();

  expect({
    refusals: ctx.readRaw(
      'SELECT id, attempt, item, phase, pool, at, refusal FROM capacity_refusals ORDER BY at',
    ),
    attempts: ctx.readRaw('SELECT id FROM attempts'),
    leases: ctx.readRaw('SELECT gen FROM leases ORDER BY gen'),
    seats: ctx.readRaw('SELECT attempt FROM limit_seats'),
  }).toStrictEqual({
    refusals: [
      {
        id: 'attempt-a',
        attempt: 'attempt-a',
        item: 'item-a',
        phase: 'build',
        pool: 'build',
        at: 1100,
        refusal,
      },
      {
        id: 'attempt-c',
        attempt: 'attempt-c',
        item: 'item-a',
        phase: 'build',
        pool: 'build',
        at: 3100,
        refusal,
      },
    ],
    attempts: [{ id: 'attempt-b' }],
    leases: [{ gen: 1 }, { gen: 2 }, { gen: 3 }],
    seats: [{ attempt: 'attempt-b' }],
  });
});
