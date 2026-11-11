import { expect, onTestFinished, test } from 'bun:test';
import { buildMockClaimChange } from '@boxxy/dispatch/test-utils/build-mock-claim-change';
import { buildMockFileItemChange } from '@boxxy/dispatch/test-utils/build-mock-file-item-change';
import { buildMockStartChange } from '@boxxy/dispatch/test-utils/build-mock-start-change';
import { createMemoryClaimStore } from '@boxxy/dispatch/test-utils/create-memory-claim-store';
import { brandSchemas } from '@boxxy/model';
import { buildMockV1AttemptRow } from '@boxxy/model/test-utils/build-mock-v1-attempt-row';
import { buildMockV1ItemRow } from '@boxxy/model/test-utils/build-mock-v1-item-row';
import invariant from 'tiny-invariant';
import { impIdentityCallerProof } from './imp-identity-caller-proof.ts';
import { createTestIssuer } from './test-utils/create-test-issuer.ts';

async function setupTest() {
  const issuer = await createTestIssuer('host-a.example.test');

  const nowMs = brandSchemas.instant.parse(1_800_000_010_000);

  return {
    issuer,
    clock: { now: () => nowMs },
    buildRequest: (headers: Readonly<Record<string, string>>) =>
      new Request('https://boxxy.example.test/rpc/attempt/current', { method: 'POST', headers }),
  };
}

test('it proves the caller of a valid token as its issuer and its machine ID', async () => {
  const ctx = await setupTest();

  const proof = impIdentityCallerProof({
    issuers: [ctx.issuer.document],
    audience: 'boxxy.example.test',
    clock: ctx.clock,
  });

  const token = await ctx.issuer.signToken({
    sub: 'machine-17',
    aud: 'boxxy.example.test',
    iat: 1_800_000_000,
    exp: 1_800_000_055,
    impName: 'agent-build-3',
  });

  const caller = await proof.prove(ctx.buildRequest({ 'Imp-Identity': token }));

  expect(caller).toStrictEqual({ issuer: 'host-a.example.test', subject: 'machine-17' });
});

test('it proves no caller for a token made for another audience', async () => {
  const ctx = await setupTest();

  const proof = impIdentityCallerProof({
    issuers: [ctx.issuer.document],
    audience: 'boxxy.example.test',
    clock: ctx.clock,
  });

  const token = await ctx.issuer.signToken({
    sub: 'machine-17',
    aud: 'other.example.test',
    iat: 1_800_000_000,
    exp: 1_800_000_055,
    impName: 'agent-build-3',
  });

  const caller = await proof.prove(ctx.buildRequest({ 'imp-identity': token }));

  expect(caller).toBeNull();
});

test.each([
  { nowMs: 1_800_000_060_000, proven: true },
  { nowMs: 1_800_000_060_999, proven: true },
  { nowMs: 1_800_000_061_000, proven: false },
])(
  'it proves the caller at $nowMs ms only within 5 s after the token expired: $proven',
  async (row) => {
    const ctx = await setupTest();

    const proof = impIdentityCallerProof({
      issuers: [ctx.issuer.document],
      audience: 'boxxy.example.test',
      clock: { now: () => brandSchemas.instant.parse(row.nowMs) },
    });

    const token = await ctx.issuer.signToken({
      sub: 'machine-17',
      aud: 'boxxy.example.test',
      iat: 1_800_000_000,
      exp: 1_800_000_055,
      impName: 'agent-build-3',
    });

    const caller = await proof.prove(ctx.buildRequest({ 'imp-identity': token }));

    expect(caller !== null).toBe(row.proven);
  },
);

test('it proves no caller for a token from an issuer the configuration does not name', async () => {
  const ctx = await setupTest();
  const stranger = await createTestIssuer('host-b.example.test');

  const proof = impIdentityCallerProof({
    issuers: [ctx.issuer.document],
    audience: 'boxxy.example.test',
    clock: ctx.clock,
  });

  const token = await stranger.signToken({
    sub: 'machine-17',
    aud: 'boxxy.example.test',
    iat: 1_800_000_000,
    exp: 1_800_000_055,
    impName: 'agent-build-3',
  });

  const caller = await proof.prove(ctx.buildRequest({ 'imp-identity': token }));

  expect(caller).toBeNull();
});

test('it proves no caller for a token that names a configured issuer but was signed by another key', async () => {
  const ctx = await setupTest();
  const forger = await createTestIssuer('host-a.example.test');

  const proof = impIdentityCallerProof({
    issuers: [ctx.issuer.document],
    audience: 'boxxy.example.test',
    clock: ctx.clock,
  });

  const token = await forger.signToken({
    sub: 'machine-17',
    aud: 'boxxy.example.test',
    iat: 1_800_000_000,
    exp: 1_800_000_055,
    impName: 'agent-build-3',
  });

  const caller = await proof.prove(ctx.buildRequest({ 'imp-identity': token }));

  expect(caller).toBeNull();
});

test('it proves no caller for a request without the identity header', async () => {
  const ctx = await setupTest();

  const proof = impIdentityCallerProof({
    issuers: [ctx.issuer.document],
    audience: 'boxxy.example.test',
    clock: ctx.clock,
  });

  const caller = await proof.prove(ctx.buildRequest({ authorization: 'Bearer worker-token' }));

  expect(caller).toBeNull();
});

test('it proves no caller for a token whose claims were changed after signing', async () => {
  const ctx = await setupTest();

  const proof = impIdentityCallerProof({
    issuers: [ctx.issuer.document],
    audience: 'boxxy.example.test',
    clock: ctx.clock,
  });

  const token = await ctx.issuer.signToken({
    sub: 'machine-17',
    aud: 'boxxy.example.test',
    iat: 1_800_000_000,
    exp: 1_800_000_055,
    impName: 'agent-build-3',
  });

  const [header, , signature] = token.split('.');

  const claims = Buffer.from(
    JSON.stringify({
      iss: 'host-a.example.test',
      sub: 'machine-99',
      aud: 'boxxy.example.test',
      iat: 1_800_000_000,
      exp: 1_800_000_055,
      imp_name: 'agent-build-3',
    }),
  ).toString('base64url');

  const caller = await proof.prove(
    ctx.buildRequest({ 'imp-identity': `${header}.${claims}.${signature}` }),
  );

  expect(caller).toBeNull();
});

test('it proves no caller when the request carries a second identity header', async () => {
  const ctx = await setupTest();

  const proof = impIdentityCallerProof({
    issuers: [ctx.issuer.document],
    audience: 'boxxy.example.test',
    clock: ctx.clock,
  });

  const token = await ctx.issuer.signToken({
    sub: 'machine-17',
    aud: 'boxxy.example.test',
    iat: 1_800_000_000,
    exp: 1_800_000_055,
    impName: 'agent-build-3',
  });

  const headers = new Headers();

  headers.append('imp-identity', token);
  headers.append('imp-identity', token);

  const caller = await proof.prove(
    new Request('https://boxxy.example.test/rpc/attempt/current', { method: 'POST', headers }),
  );

  expect(caller).toBeNull();
});

test('it proves no caller when the configuration names no trust document', async () => {
  const ctx = await setupTest();

  const proof = impIdentityCallerProof({
    issuers: [],
    audience: 'boxxy.example.test',
    clock: ctx.clock,
  });

  const token = await ctx.issuer.signToken({
    sub: 'machine-17',
    aud: 'boxxy.example.test',
    iat: 1_800_000_000,
    exp: 1_800_000_055,
    impName: 'agent-build-3',
  });

  const caller = await proof.prove(ctx.buildRequest({ 'imp-identity': token }));

  expect(caller).toBeNull();
});

test('it proves no caller when the configuration names an empty audience', async () => {
  const ctx = await setupTest();

  const proof = impIdentityCallerProof({
    issuers: [ctx.issuer.document],
    audience: '',
    clock: ctx.clock,
  });

  const token = await ctx.issuer.signToken({
    sub: 'machine-17',
    aud: '',
    iat: 1_800_000_000,
    exp: 1_800_000_055,
    impName: 'agent-build-3',
  });

  const caller = await proof.prove(ctx.buildRequest({ 'imp-identity': token }));

  expect(caller).toBeNull();
});

test('it throws at start for a trust document that is not one', async () => {
  const ctx = await setupTest();

  expect(() =>
    impIdentityCallerProof({
      issuers: [{ issuer: 'host-a.example.test', keys: [] }],
      audience: 'boxxy.example.test',
      clock: ctx.clock,
    }),
  ).toThrow();
});

test('it throws at start for two trust documents of one issuer', async () => {
  const ctx = await setupTest();
  const twin = await createTestIssuer('host-a.example.test');

  expect(() =>
    impIdentityCallerProof({
      issuers: [ctx.issuer.document, twin.document],
      audience: 'boxxy.example.test',
      clock: ctx.clock,
    }),
  ).toThrowWithMessage(Error, /two identity key documents name the issuer host-a.example.test/u);
});

test.each([
  { machine: 'machine-17', session: 'atc-session-1' },
  { machine: 'machine-18', session: null },
])(
  'it proves a caller that the store joins to the session of $machine only on that machine: $session',
  async (row) => {
    const ctx = await setupTest();

    const store = createMemoryClaimStore();

    const attempt = buildMockV1AttemptRow({
      state: 'starting',
      atcSession: brandSchemas.atcSessionId.parse('atc-session-1'),
    });

    onTestFinished(() => store.close());

    await store.exclusive(async (transaction) => {
      await transaction.applyChange(
        buildMockFileItemChange(buildMockV1ItemRow({ id: attempt.item })),
      );

      await transaction.applyChange(buildMockClaimChange(attempt));

      await transaction.applyChange(
        buildMockStartChange(attempt, { issuer: 'host-a.example.test', subject: 'machine-17' }),
      );
    });

    const proof = impIdentityCallerProof({
      issuers: [ctx.issuer.document],
      audience: 'boxxy.example.test',
      clock: ctx.clock,
    });

    const token = await ctx.issuer.signToken({
      sub: row.machine,
      aud: 'boxxy.example.test',
      iat: 1_800_000_000,
      exp: 1_800_000_055,
      impName: 'agent-build-3',
    });

    const caller = await proof.prove(ctx.buildRequest({ 'imp-identity': token }));

    invariant(caller, 'a valid token proves a caller');

    const found = await store.read((transaction) => transaction.findSessionByCaller(caller));

    expect<string | null>(found).toBe(row.session);
  },
);
