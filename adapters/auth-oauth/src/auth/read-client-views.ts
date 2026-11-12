// Copied from atc: packages/mcp/src/auth/read-client-views.ts at commit 4fe647cf.

import type { Kysely } from 'kysely';
import { parseJSONStrings } from '../utils/parse-json-strings.ts';
import type { MCPAuthSchema } from './mcp-auth-schema.ts';

export interface ClientView {
  readonly clientID: string;
  readonly name: string;
  readonly redirectURIs: readonly string[];
  readonly createdAt: string | null;
}

export async function readClientViews(db: Kysely<MCPAuthSchema>): Promise<readonly ClientView[]> {
  const rows = await db
    .selectFrom('oauthClient')
    .select(['clientId', 'name', 'redirectUris', 'createdAt'])
    .orderBy('createdAt')
    .execute();

  return rows.map((row) => ({
    clientID: row.clientId,
    name: row.name ?? '',
    redirectURIs: parseJSONStrings(row.redirectUris) ?? [],
    createdAt: row.createdAt,
  }));
}
