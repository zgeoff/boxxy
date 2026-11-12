import type { Database } from 'bun:sqlite';

// The settings each handle of the store sets when it opens.
export function writeHandleSettings(handle: Database, busyTimeoutMs: number): void {
  handle.run(`PRAGMA busy_timeout = ${busyTimeoutMs}`);

  // By default SQLite puts a statement journal or a large sort in a file in a temp folder. On a
  // host with no writable temp folder, such as a container with a read-only root, the statement
  // fails with SQLITE_IOERR_GETTEMPPATH, and SQLite ends the whole transaction.
  handle.run('PRAGMA temp_store = MEMORY');
}
