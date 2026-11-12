// Copied from atc: packages/mcp/src/auth/derive-token-hash.test.ts at commit 4fe647cf.

import { expect, test } from 'bun:test';
import { deriveTokenHash } from './derive-token-hash.ts';

test('it hashes a token to its base64url SHA-256', () => {
  expect(deriveTokenHash('boxxy_at_example')).toBe('SRqOU3ncEuILg11EpDJ4VaEbas1G9oVED9dkl3GtCZ0');
});
