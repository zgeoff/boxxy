import { expect, onTestFinished, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withBusyRetry } from './with-busy-retry.ts';

async function setupTest() {
  const cleanup = new AsyncDisposableStack();

  onTestFinished(() => cleanup.disposeAsync());

  const folder = await mkdtemp(join(tmpdir(), 'boxxy-busy-retry-'));

  cleanup.defer(() => rm(folder, { recursive: true, force: true }));

  const openHandle = () => {
    const sqlite = new Database(join(folder, 'store.db'), { create: true });

    cleanup.defer(() => {
      sqlite.close();
    });

    sqlite.run('PRAGMA journal_mode = WAL');

    return sqlite;
  };

  const reader = openHandle();
  const writer = openHandle();

  writer.run('CREATE TABLE notes (body TEXT)');

  return {
    // a write after this fails with SQLITE_BUSY_SNAPSHOT: the read holds a snapshot older than the
    // last commit
    startStaleRead: () => {
      reader.run('BEGIN');
      reader.query('SELECT body FROM notes').all();
      writer.run("INSERT INTO notes VALUES ('Mend the gate')");
    },
    writeFromStaleRead: () => {
      reader.run("INSERT INTO notes VALUES ('Oil the hinge')");
    },
  };
}

test('it retries work that fails with an extended busy code until the wait limit', async () => {
  const ctx = await setupTest();

  const tries: string[] = [];

  ctx.startStaleRead();

  const refusal: unknown = await withBusyRetry(50, () => {
    tries.push('try');
    ctx.writeFromStaleRead();
  }).then(
    () => null,
    (error: unknown) => error,
  );

  expect(refusal).toMatchObject({ code: 'SQLITE_BUSY_SNAPSHOT' });
  expect(tries.length).toBeGreaterThan(1);
});
