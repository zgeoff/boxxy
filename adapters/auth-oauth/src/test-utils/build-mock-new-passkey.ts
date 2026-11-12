// Copied from atc: packages/mcp/src/test-utils/build-mock-new-passkey.ts at commit 4fe647cf.

import type { NewPasskey } from '../auth/create-passkey.ts';

export function buildMockNewPasskey(overrides: Partial<NewPasskey> = {}): NewPasskey {
  return {
    tokenHash: 'a'.repeat(64),
    id: 'credential-0001',
    publicKey: 'AQID',
    counter: 0,
    transports: ['internal'],
    now: Date.parse('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}
