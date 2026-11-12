// Adapted from atc: packages/mcp/src/testing/open-test-auth-database.ts at commit 4fe647cf.

import { Database } from 'bun:sqlite';
import { buildSQLiteDialect } from '@zgeoff/kysely-bun-sqlite';
import type { MCPAuthDatabase } from './mcp-auth-database.ts';

// A write waits for another process's lock, and the cascades from a client to its tokens need
// foreign keys.
export function openAuthDatabase(path: string): MCPAuthDatabase {
  const sqlite = new Database(path, { create: true });

  sqlite.run('PRAGMA journal_mode = WAL;');
  sqlite.run('PRAGMA busy_timeout = 5000;');
  sqlite.run('PRAGMA foreign_keys = ON;');

  return {
    dialect: buildSQLiteDialect(sqlite),
    close: () => {
      sqlite.close();
    },
  };
}
