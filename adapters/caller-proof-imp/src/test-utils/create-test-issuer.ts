interface TestTokenClaims {
  readonly sub: string;
  readonly aud: string;
  readonly iat: number;
  readonly exp: number;
  readonly impName: string;
}

export interface TestIssuer {
  // the trust document of the issuer, as the deployment's file holds it
  readonly document: unknown;
  readonly signToken: (claims: TestTokenClaims) => Promise<string>;
}

// An issuer with a key pair made at run time, which signs identity tokens as the broker does: a
// compact ES256 JWT whose signature is the raw 64-byte r and s.
export async function createTestIssuer(issuer: string): Promise<TestIssuer> {
  const kid = `${issuer}-key-1`;

  const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);

  const publicKey = await crypto.subtle.exportKey('jwk', keys.publicKey);

  return {
    document: {
      issuer,
      keys: [
        { kty: 'EC', crv: 'P-256', x: publicKey.x, y: publicKey.y, kid, alg: 'ES256', use: 'sig' },
      ],
      retire: [],
    },
    signToken: async (claims) => {
      const header = toBase64URL(JSON.stringify({ alg: 'ES256', kid, typ: 'JWT' }));

      const payload = toBase64URL(
        JSON.stringify({
          iss: issuer,
          sub: claims.sub,
          aud: claims.aud,
          iat: claims.iat,
          exp: claims.exp,
          imp_name: claims.impName,
        }),
      );

      const signature = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        keys.privateKey,
        new TextEncoder().encode(`${header}.${payload}`),
      );

      return `${header}.${payload}.${toBase64URL(new Uint8Array(signature))}`;
    },
  };
}

function toBase64URL(content: string | Uint8Array): string {
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;

  return Buffer.from(bytes).toString('base64url');
}
