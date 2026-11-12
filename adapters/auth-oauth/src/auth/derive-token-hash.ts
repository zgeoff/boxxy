// Copied from atc: packages/mcp/src/auth/derive-token-hash.ts at commit 4fe647cf.

import { createHash } from 'node:crypto';

export function deriveTokenHash(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}
