// Copied from atc: packages/mcp/src/auth/mcp-auth-database.ts at commit 4fe647cf.

import type { Dialect } from 'kysely';

export interface MCPAuthDatabase {
  readonly dialect: Dialect;

  // releases the file, once Kysely is done with it.
  readonly close: () => void;
}
