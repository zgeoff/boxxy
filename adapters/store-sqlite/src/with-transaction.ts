import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { StoreDatabase } from './types.ts';

export async function withTransaction<T>(
  db: Kysely<StoreDatabase>,
  begin: (db: Kysely<StoreDatabase>) => Promise<unknown>,
  work: () => Promise<T>,
): Promise<T> {
  await begin(db);

  try {
    const result = await work();

    await sql`COMMIT`.execute(db);

    return result;
  } catch (error) {
    // SQLite ends the transaction by itself after some errors, such as a full disk, and ROLLBACK
    // then fails; its error joins the first one, never replaces it
    await sql`ROLLBACK`.execute(db).catch((rollbackError: unknown) => {
      throw new AggregateError([error, rollbackError], 'the work failed, and so did its rollback', {
        cause: error,
      });
    });

    throw error;
  }
}
