// Copied from atc: packages/mcp/src/test-utils/types.ts at commit 4fe647cf.

import type { Kysely } from 'kysely';
import type { MCPAuthSchema } from '../auth/mcp-auth-schema.ts';
import type { AuthClock } from '../utils/types.ts';

// The handles the seeds of the authorization database take.
export interface MCPAuthSeedDeps {
  readonly db: Kysely<MCPAuthSchema>;
  readonly clock: Pick<AuthClock, 'now'>;
}
