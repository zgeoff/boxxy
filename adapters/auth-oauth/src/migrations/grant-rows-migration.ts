import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

// The time better-auth writes, as ISO 8601 text in UTC with milliseconds, so the text compares in
// time order.
const now = sql`strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;

// better-auth 1.7.15 made the token and session tables with `userId` referencing `user(id)` on
// delete cascade, so only `user` needs a rebuild.
const statements = [
  sql`CREATE TEMP TABLE boxxy_grant_token AS
    SELECT authorizationCodeId AS grantId, clientId, scopes, createdAt, expiresAt, revoked
      FROM oauthRefreshToken WHERE authorizationCodeId IS NOT NULL
    UNION ALL
    SELECT authorizationCodeId, clientId, scopes, createdAt, expiresAt, revoked
      FROM oauthAccessToken WHERE authorizationCodeId IS NOT NULL`,

  // SQLite cannot add a NOT NULL column with no default, so the table is made anew, in the shape
  // the package's better-auth gives a new database.
  sql`CREATE TABLE boxxy_grant_user (
    "id" text not null primary key,
    "name" text not null,
    "email" text not null unique,
    "emailVerified" integer not null,
    "image" text,
    "createdAt" date not null,
    "updatedAt" date not null,
    "clientId" text not null,
    "scopes" text,
    "approvedBy" text not null,
    "limits" text,
    "lastUsedAt" date
  )`,

  // With max(), SQLite takes the other bare columns from the row that holds the maximum, so each
  // grant takes the scopes of its newest live token.
  sql`INSERT INTO boxxy_grant_user
      (id, name, email, emailVerified, image, createdAt, updatedAt, clientId, scopes, approvedBy, limits, lastUsedAt)
    SELECT
      live.grantId,
      coalesce(client.name, live.clientId),
      live.grantId || '@grant.invalid',
      1,
      NULL,
      first.createdAt,
      first.createdAt,
      live.clientId,
      (SELECT json_group_array(scope.value) FROM json_each(live.scopes) AS scope
        WHERE scope.value <> 'offline_access'),
      'passkey',
      NULL,
      used.last_used_at
    FROM (
      SELECT grantId, clientId, scopes, max(createdAt) AS newestAt FROM boxxy_grant_token
        WHERE revoked IS NULL AND expiresAt > ${now}
        GROUP BY grantId
    ) AS live
    JOIN (
      SELECT grantId, min(createdAt) AS createdAt FROM boxxy_grant_token GROUP BY grantId
    ) AS first ON first.grantId = live.grantId
    LEFT JOIN oauthClient AS client ON client.clientId = live.clientId
    LEFT JOIN boxxy_grant_use AS used ON used.grant_id = live.grantId`,

  sql`UPDATE oauthAccessToken SET userId = authorizationCodeId, sessionId = NULL
    WHERE authorizationCodeId IN (SELECT id FROM boxxy_grant_user)`,
  sql`DELETE FROM oauthAccessToken
    WHERE authorizationCodeId IS NULL OR authorizationCodeId NOT IN (SELECT id FROM boxxy_grant_user)`,
  sql`UPDATE oauthRefreshToken SET userId = authorizationCodeId, sessionId = NULL
    WHERE authorizationCodeId IN (SELECT id FROM boxxy_grant_user)`,
  sql`DELETE FROM oauthRefreshToken
    WHERE authorizationCodeId IS NULL OR authorizationCodeId NOT IN (SELECT id FROM boxxy_grant_user)`,

  // Every session, account and consent belonged to the owner row, and the foreign keys are off, so
  // its delete cascades to none of them.
  sql`DELETE FROM session`,
  sql`DELETE FROM account`,
  sql`DELETE FROM oauthConsent`,
  sql`UPDATE oauthClient SET userId = NULL`,
  sql`DROP TABLE "user"`,
  sql`ALTER TABLE boxxy_grant_user RENAME TO "user"`,
  sql`DROP TABLE boxxy_grant_use`,
  sql`DROP TABLE temp.boxxy_grant_token`,
];

export const grantRowsMigration: Migration = {
  up: async (db: Kysely<unknown>) => {
    const table =
      await sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'user'`.execute(db);

    // A new database has no tables yet: better-auth makes them when the package opens it.
    if (table.rows.length === 0) {
      return;
    }

    for (const statement of statements) {
      await statement.execute(db);
    }

    const broken = await sql`PRAGMA foreign_key_check`.execute(db);

    if (broken.rows.length > 0) {
      throw new Error(
        `the grant migration left ${broken.rows.length} rows whose foreign key points at no row`,
      );
    }
  },
};
