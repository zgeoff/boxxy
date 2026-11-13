import type { Database } from 'bun:sqlite';
import { createHash } from 'node:crypto';
import { PRE_PACKAGE_SCHEMA } from './pre-package-schema.ts';

export interface PrePackageGrant {
  readonly clientName: string;
  readonly scopes: readonly string[];

  // how many times the client refreshed; each refresh rotated out the token pair before it
  readonly refreshes: number;

  // what the old `boxxy_grant_use` table held for the grant
  readonly lastUsedAt: string | null;

  // true: every token of the grant expired an hour ago
  readonly isExpired?: boolean;
}

export interface PrePackageAuth {
  readonly origin: string;
  readonly grants: readonly PrePackageGrant[];
  readonly passkeyID: string;
  readonly now: number;
}

// One per seeded grant, in the order of the input: its IDs, and its newest token pair.
export interface SeededPrePackageGrant {
  readonly grantID: string;
  readonly clientID: string;
  readonly accessToken: string;
  readonly refreshToken: string;
}

const OWNER_ID = 'owner-user-row';
const HOUR_MS = 60 * 60_000;

// Writes the auth database the way boxxy's own OAuth server left it before the package: one owner
// `user` row that every token, session and consent points at, and the grant-use table. No old
// module is left to seed through, so the rows go in directly, as that server wrote them.
export function seedPrePackageAuth(
  sqlite: Database,
  input: PrePackageAuth,
): SeededPrePackageGrant[] {
  const at = (offsetMs: number) => new Date(input.now + offsetMs).toISOString();

  return sqlite.transaction(() => {
    for (const statement of PRE_PACKAGE_SCHEMA) {
      sqlite.run(statement);
    }

    sqlite.run(
      `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, 'owner', 'owner@boxxy.invalid', 1, ?, ?)`,
      [OWNER_ID, at(-HOUR_MS), at(-HOUR_MS)],
    );

    sqlite.run(
      `INSERT INTO session (id, expiresAt, token, createdAt, updatedAt, userId) VALUES ('owner-session', ?, 'owner-session-token', ?, ?, ?)`,
      [at(HOUR_MS), at(-HOUR_MS), at(-HOUR_MS), OWNER_ID],
    );

    sqlite.run(
      `INSERT INTO oauthResource (id, identifier, name, customClaims, dpopBoundAccessTokensRequired, disabled, createdAt, updatedAt, policyVersion, metadata) VALUES ('resource-1', ?, ?, 'null', 0, 0, ?, ?, 1, 'null')`,
      [`${input.origin}/mcp`, `${input.origin}/mcp`, at(-HOUR_MS), at(-HOUR_MS)],
    );

    sqlite.run(
      `INSERT INTO boxxy_passkey (id, public_key, counter, transports, created_at, last_used_at) VALUES (?, 'pQECAyYgASFYIA', 1, '["internal"]', ?, ?)`,
      [input.passkeyID, at(-HOUR_MS), at(-HOUR_MS)],
    );

    return input.grants.map((grant, index) =>
      seedGrant(sqlite, grant, { index, at, resource: JSON.stringify([`${input.origin}/mcp`]) }),
    );
  })();
}

interface GrantContext {
  readonly index: number;
  readonly at: (offsetMs: number) => string;
  readonly resource: string;
}

function seedGrant(
  sqlite: Database,
  grant: PrePackageGrant,
  ctx: GrantContext,
): SeededPrePackageGrant {
  const clientID = `client-${ctx.index}`;
  const grantID = `code-${ctx.index}`;
  const scopes = JSON.stringify([...grant.scopes, 'offline_access']);
  const createdAt = ctx.at(-2 * HOUR_MS);
  const accessExpiresAt = grant.isExpired === true ? ctx.at(-HOUR_MS) : ctx.at(HOUR_MS);
  const refreshExpiresAt = grant.isExpired === true ? ctx.at(-HOUR_MS) : ctx.at(30 * 24 * HOUR_MS);

  sqlite.run(
    `INSERT INTO oauthClient (id, clientId, disabled, scopes, clientCredentialsScopes, createdAt, updatedAt, name, redirectUris, tokenEndpointAuthMethod, applicationType, grantTypes, responseTypes, requirePKCE, dpopBoundAccessTokens) VALUES (?, ?, 0, '["read","write","offline_access"]', '[]', ?, ?, ?, '["https://client.example/callback"]', 'none', 'web', '["authorization_code","refresh_token"]', '["code"]', 1, 0)`,
    [`row-${clientID}`, clientID, createdAt, createdAt, grant.clientName],
  );

  sqlite.run(
    `INSERT INTO oauthConsent (id, clientId, userId, resources, requestedUserInfoClaims, scopes, createdAt, updatedAt) VALUES (?, ?, ?, ?, '[]', ?, ?, ?)`,
    [`consent-${clientID}`, clientID, OWNER_ID, ctx.resource, scopes, createdAt, createdAt],
  );

  for (let pair = 0; pair <= grant.refreshes; pair++) {
    const refreshID = `refresh-${grantID}-${pair}`;
    const rotatedAt = pair < grant.refreshes ? createdAt : null;

    sqlite.run(
      `INSERT INTO oauthRefreshToken (id, token, clientId, userId, authorizationCodeId, resources, expiresAt, createdAt, revoked, rotatedAt, authTime, scopes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        refreshID,
        toTokenHash(`refresh-token-${grantID}-${pair}`),
        clientID,
        OWNER_ID,
        grantID,
        ctx.resource,
        refreshExpiresAt,
        createdAt,
        rotatedAt,
        rotatedAt,
        createdAt,
        scopes,
      ],
    );

    sqlite.run(
      `INSERT INTO oauthAccessToken (id, token, clientId, userId, authorizationCodeId, resources, refreshId, expiresAt, createdAt, scopes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `access-${grantID}-${pair}`,
        toTokenHash(`access-token-${grantID}-${pair}`),
        clientID,
        OWNER_ID,
        grantID,
        ctx.resource,
        refreshID,
        accessExpiresAt,
        createdAt,
        scopes,
      ],
    );
  }

  if (grant.lastUsedAt !== null) {
    sqlite.run(`INSERT INTO boxxy_grant_use (grant_id, last_used_at) VALUES (?, ?)`, [
      grantID,
      grant.lastUsedAt,
    ]);
  }

  return {
    grantID,
    clientID,
    accessToken: `access-token-${grantID}-${grant.refreshes}`,
    refreshToken: `refresh-token-${grantID}-${grant.refreshes}`,
  };
}

// better-auth stores each token as its SHA-256 digest, in base64url.
function toTokenHash(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}
