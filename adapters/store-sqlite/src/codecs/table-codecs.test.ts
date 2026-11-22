import { expect, onTestFinished, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { createSQLiteClaimStore } from '../create-sqlite-claim-store.ts';
import { parseStoreRow } from './parse-store-row.ts';
import { tableCodecs } from './table-codecs.ts';
import { toColumnName } from './to-column-name.ts';

async function setupTest() {
  const cleanup = new AsyncDisposableStack();

  onTestFinished(() => cleanup.disposeAsync());

  const folder = await mkdtemp(join(tmpdir(), 'boxxy-codecs-'));

  cleanup.defer(() => rm(folder, { recursive: true, force: true }));

  const path = join(folder, 'store.db');

  const store = await createSQLiteClaimStore(path);

  await store.close();

  const sqlite = new Database(path, { readonly: true });

  cleanup.defer(() => {
    sqlite.close();
  });

  return {
    readColumns: (table: string) =>
      z
        .array(z.object({ name: z.string() }))
        .parse(sqlite.query('SELECT name FROM pragma_table_info(?) ORDER BY cid').all(table))
        .map((column) => column.name),
  };
}

test.each(Object.entries(tableCodecs))(
  'it maps each field of %s to a column',
  async (table, codec) => {
    const ctx = await setupTest();

    const fields: readonly string[] = codec.fields;

    expect(ctx.readColumns(table)).toStrictEqual(fields.map((field) => toColumnName(field)));
  },
);

test('it reads the number of a stored item as its short reference, and refuses an item with none', () => {
  const record = {
    id: '0192f0c4-7b1e-7a10-9d55-3f2a1c0e9b77',
    kind: 'core.issue',
    repo: 'acme/widgets',
    title: 'Add a retry button',
    outcome: 'A failed upload can be sent again',
    body: '',
    acceptance: '[]',
    fields: '{}',
    labels: '[]',
    found_in_attempt: null,
    filed_by: 'boxxy:owner:local',
    filed_at: 1000,
    closed_at: null,
    close_reason: null,
    kept_session: null,
  };

  const ref: string = parseStoreRow('items', { ...record, ref: 12 }).ref;

  expect(ref).toBe('i-12');
  expect(() => parseStoreRow('items', { ...record, ref: null })).toThrow();
});
