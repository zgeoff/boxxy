// Copied from atc: packages/mcp/src/test-utils/build-seeder.ts at commit 4fe647cf.

import { buildPasskeySeeder } from './build-passkey-seeder.ts';
import type { MCPAuthSeedDeps } from './types.ts';

export type TestDeps = MCPAuthSeedDeps;

export function buildSeeder(deps: TestDeps) {
  return buildPasskeySeeder(deps);
}
