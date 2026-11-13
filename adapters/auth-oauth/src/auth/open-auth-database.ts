import { Database } from 'bun:sqlite';
import { chmodSync, closeSync, openSync } from 'node:fs';

// The file holds token hashes and sessions, so only its owner may read it. SQLite gives the WAL and
// shared-memory files the main file's mode, so the mode is set before SQLite opens the file.
export function openAuthDatabase(path: string): Database {
  closeSync(openSync(path, 'a', 0o600));
  chmodSync(path, 0o600);

  const sqlite = new Database(path, { create: true });

  sqlite.run('PRAGMA journal_mode = WAL;');
  sqlite.run('PRAGMA busy_timeout = 5000;');
  sqlite.run('PRAGMA foreign_keys = ON;');

  return sqlite;
}
