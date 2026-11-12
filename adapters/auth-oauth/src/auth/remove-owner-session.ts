// Copied from atc: packages/mcp/src/auth/remove-owner-session.ts at commit 4fe647cf.

import type { Kysely } from 'kysely';
import type { MCPAuthSchema } from './mcp-auth-schema.ts';

export async function removeOwnerSession(
  db: Kysely<MCPAuthSchema>,
  sessionID: string,
): Promise<void> {
  await db.deleteFrom('session').where('id', '=', sessionID).execute();
}
