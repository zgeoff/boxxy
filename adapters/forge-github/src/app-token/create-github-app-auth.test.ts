import { expect, test } from 'bun:test';
import { createPublicKey, generateKeyPairSync, verify } from 'node:crypto';
import { HttpResponse, http } from 'msw';
import { GithubForgeError } from '../github-forge-error.ts';
import { GITHUB_API_URL } from '../test-utils/github-handlers.ts';
import { mockNetwork } from '../test-utils/mock-network.ts';
import { createGithubAppAuth } from './create-github-app-auth.ts';

function setupTest() {
  // GitHub hands out the App's private key as PKCS#1 PEM
  const keys = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

  const clock = { nowMs: 1_900_000_000_000 };
  const minted: (string | null)[] = [];

  const auth = createGithubAppAuth({
    keys: { clientID: 'Iv23liTestClient0001', privateKey: keys.privateKey, installationID: 4242 },
    baseUrl: `${GITHUB_API_URL}/`,
    fetch: globalThis.fetch,
    nowMs: () => clock.nowMs,
  });

  return {
    auth,
    clock,
    minted,
    publicKey: keys.publicKey,

    // answers each mint with `token-<n>`, valid for an hour from the test's clock
    answerMints: () => {
      mockNetwork.use(
        http.post(`${GITHUB_API_URL}/app/installations/4242/access_tokens`, (info) => {
          minted.push(info.request.headers.get('authorization'));

          return HttpResponse.json(
            {
              token: `token-${minted.length}`,
              expires_at: new Date(clock.nowMs + 60 * 60 * 1000).toISOString(),
            },
            { status: 201 },
          );
        }),
      );
    },
  };
}

test('it mints the installation token with a JWT signed RS256 whose iss is the client ID', async () => {
  const ctx = setupTest();

  ctx.answerMints();

  const token = await ctx.auth.readToken();

  const jwt = (ctx.minted[0] ?? '').replace(/^bearer /iu, '');
  const [header = '', payload = '', signature = ''] = jwt.split('.');

  const isSigned = verify(
    'RSA-SHA256',
    Buffer.from(`${header}.${payload}`),
    createPublicKey(ctx.publicKey),
    Buffer.from(signature, 'base64url'),
  );

  expect([
    token,
    JSON.parse(Buffer.from(header, 'base64url').toString()),
    JSON.parse(Buffer.from(payload, 'base64url').toString()),
    isSigned,
  ]).toStrictEqual([
    'token-1',
    { alg: 'RS256', typ: 'JWT' },
    { iat: expect.any(Number), exp: expect.any(Number), iss: 'Iv23liTestClient0001' },
    true,
  ]);
});

test('it holds the token until five minutes before it expires, then mints again', async () => {
  const ctx = setupTest();

  ctx.answerMints();

  await ctx.auth.readToken();

  ctx.clock.nowMs += 54 * 60 * 1000;

  const held = await ctx.auth.readToken();

  ctx.clock.nowMs += 2 * 60 * 1000;

  const renewed = await ctx.auth.readToken();

  expect([held, renewed, ctx.minted.length]).toStrictEqual(['token-1', 'token-2', 2]);
});

test('it shares one mint between two calls that wait on it', async () => {
  const ctx = setupTest();

  ctx.answerMints();

  const tokens = await Promise.all([ctx.auth.readToken(), ctx.auth.readToken()]);

  expect([tokens, ctx.minted.length]).toStrictEqual([['token-1', 'token-1'], 1]);
});

test('it throws an error with the status and no key or JWT for a refused mint, and mints again on the next call', async () => {
  const ctx = setupTest();

  mockNetwork.use(
    http.post(
      `${GITHUB_API_URL}/app/installations/4242/access_tokens`,
      () => HttpResponse.json({ message: 'Bad credentials' }, { status: 401 }),
      { once: true },
    ),
  );

  const failure: unknown = await ctx.auth.readToken().catch((error: unknown) => error);

  ctx.answerMints();

  const token = await ctx.auth.readToken();

  expect([failure, token]).toStrictEqual([
    new GithubForgeError("GitHub did not mint the App's installation token (status 401)", 401),
    'token-1',
  ]);
});
