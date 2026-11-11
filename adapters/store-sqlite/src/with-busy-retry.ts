import { SQLiteError } from 'bun:sqlite';

const retryDelayMs = 10;

// bun:sqlite waits on a busy lock synchronously, which stalls every other store in the process for
// the whole wait, so the statement fails at once and this waits between tries without blocking.
export async function withBusyRetry(waitLimitMs: number, work: () => unknown): Promise<void> {
  const startMs = performance.now();

  for (;;) {
    try {
      await work();

      return;
    } catch (error) {
      if (!isBusy(error) || performance.now() - startMs >= waitLimitMs) {
        throw error;
      }
    }

    await Bun.sleep(retryDelayMs);
  }
}

function isBusy(error: unknown): boolean {
  return error instanceof SQLiteError && error.code === 'SQLITE_BUSY';
}
