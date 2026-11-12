// Copied from atc: packages/mcp/src/auth/read-grant-views.ts at commit 4fe647cf.

import { grantScopes } from '@boxxy/contract';
import type { GrantScope } from '@boxxy/contract';
import type { Kysely } from 'kysely';
import { parseJSONStrings } from '../utils/parse-json-strings.ts';
import type { MCPAuthSchema } from './mcp-auth-schema.ts';

export interface GrantView {
  readonly grantID: string;
  readonly clientID: string;
  readonly clientName: string;
  readonly scopes: readonly GrantScope[];
  readonly createdAt: string;
  readonly lastUsedAt: string | null;
}

export async function readGrantViews(db: Kysely<MCPAuthSchema>): Promise<readonly GrantView[]> {
  const rows = await db
    .selectFrom('oauthRefreshToken')
    .leftJoin('oauthClient', 'oauthClient.clientId', 'oauthRefreshToken.clientId')
    .leftJoin(
      'boxxy_grant_use',
      'boxxy_grant_use.grant_id',
      'oauthRefreshToken.authorizationCodeId',
    )
    .select([
      'oauthRefreshToken.authorizationCodeId',
      'oauthRefreshToken.clientId',
      'oauthRefreshToken.scopes',
      'oauthRefreshToken.createdAt',
      'oauthClient.name',
      'boxxy_grant_use.last_used_at',
    ])
    .where('oauthRefreshToken.revoked', 'is', null)
    .where('oauthRefreshToken.expiresAt', '>', new Date().toISOString())
    .where('oauthRefreshToken.authorizationCodeId', 'is not', null)
    .orderBy('oauthRefreshToken.createdAt')
    .execute();

  return rows.map((row) => {
    const scopes = parseJSONStrings(row.scopes) ?? [];

    return {
      grantID: row.authorizationCodeId ?? '',
      clientID: row.clientId,
      clientName: row.name ?? '',
      scopes: grantScopes.filter((scope) => scopes.includes(scope)),
      createdAt: row.createdAt,
      lastUsedAt: row.last_used_at,
    };
  });
}
