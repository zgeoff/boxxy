import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

const statements = [
  sql`ALTER TABLE links RENAME TO relations`,
  sql`DROP INDEX links_live`,
  sql`CREATE UNIQUE INDEX relations_live ON relations (source, target, type) WHERE removed_at IS NULL`,
];

export const renameRelationsMigration: Migration = {
  up: async (db: Kysely<unknown>) => {
    for (const statement of statements) {
      await statement.execute(db);
    }
  },
};
