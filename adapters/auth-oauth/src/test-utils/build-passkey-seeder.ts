// Copied from atc: packages/mcp/src/test-utils/build-passkey-seeder.ts at commit 4fe647cf.

import { seedPasskey } from './seed-passkey.ts';
import type { PasskeyInput } from './seed-passkey.ts';
import type { MCPAuthSeedDeps } from './types.ts';

export function buildPasskeySeeder(deps: MCPAuthSeedDeps) {
  return {
    passkey: (input?: PasskeyInput) => seedPasskey(deps, input),
  };
}
