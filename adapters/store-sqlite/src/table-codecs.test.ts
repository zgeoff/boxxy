import { expect, onTestFinished, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { createSQLiteClaimStore } from './create-sqlite-claim-store.ts';
import { tableCodecs } from './table-codecs.ts';
import { toColumnName } from './to-column-name.ts';

async function setupTest() {
  const folder = await mkdtemp(join(tmpdir(), 'boxxy-codecs-'));

  onTestFinished(() => rm(folder, { recursive: true, force: true }));

  const path = join(folder, 'store.db');

  const store = await createSQLiteClaimStore(path);

  await store.close();

  const sqlite = new Database(path, { readonly: true });

  onTestFinished(() => {
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
