import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { StoreDatabase } from '../types.ts';
import { withBusyRetry } from '../with-busy-retry.ts';

export async function takeWriteLock(db: Kysely<StoreDatabase>, waitLimitMs: number): Promise<void> {
  await withBusyRetry(waitLimitMs, () => sql`BEGIN IMMEDIATE`.execute(db));
}
