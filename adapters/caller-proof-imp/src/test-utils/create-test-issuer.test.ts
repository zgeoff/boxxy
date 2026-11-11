import { expect, test } from 'bun:test';
import { loadIdentityIssuers, verifyImpIdentity } from '@impz/client/identity';
import { createTestIssuer } from './create-test-issuer.ts';

test('it signs a token that the identity library verifies against its trust document', async () => {
  const issuer = await createTestIssuer('host-a.example.test');

  const token = await issuer.signToken({
    sub: 'machine-17',
    aud: 'boxxy.example.test',
    iat: 1_800_000_000,
    exp: 1_800_000_055,
    impName: 'agent-build-3',
  });

  const verified = await verifyImpIdentity(token, {
    issuers: loadIdentityIssuers([issuer.document]),
    audience: 'boxxy.example.test',
    nowSeconds: 1_800_000_010,
  });

  expect(verified).toStrictEqual({
    issuer: 'host-a.example.test',
    id: 'machine-17',
    name: 'agent-build-3',
  });
});
