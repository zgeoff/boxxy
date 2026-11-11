import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createTestIssuer } from '@boxxy/caller-proof-imp/test-utils/create-test-issuer';
import { brandSchemas } from '@boxxy/model';
import invariant from 'tiny-invariant';
import { buildRPCRequest } from '../test-utils/build-rpc-request.ts';
import { createTestServer } from '../test-utils/create-test-server.ts';
import { readCallerProof } from './read-caller-proof.ts';

async function setupTest() {
  const audience = 'boxxy.example.test';

  const folder = await mkdtemp(path.join(tmpdir(), 'boxxy-test-proof-'));

  onTestFinished(() => rm(folder, { recursive: true, force: true }));

  // the fake worker reports this issuer, with the session ID as the machine ID
  const issuer = await createTestIssuer('fake-worker');

  await Bun.write(path.join(folder, 'issuer.json'), JSON.stringify(issuer.document));

  const server = await createTestServer({
    makeCallerProof: async (clock) => {
      const answer = await readCallerProof({ folders: [folder], audience }, clock);

      invariant(answer.kind === 'read', 'the trust document is read');

      return answer.callerProof;
    },
  });

  return {
    ...server,
    folder,
    audience,

    // `attempt.current` through the broker, with an identity token for the machine
    callCurrent: async (machine: string) => {
      const nowSeconds = Math.floor(server.dispatch.clock.now() / 1000);

      const token = await issuer.signToken({
        sub: machine,
        aud: audience,
        iat: nowSeconds,
        exp: nowSeconds + 55,
        impName: 'machine-name',
      });

      const request = buildRPCRequest({
        procedure: 'attempt.current',
        input: {},
        token: server.workerToken,
      });

      request.headers.set('imp-identity', token);

      const response = await server.worker(request);
      const body: unknown = await response.json();

      return { status: response.status, body };
    },
  };
}

test('#readCallerProof proves the machine of a signed token, so its session reaches its attempt', async () => {
  const ctx = await setupTest();
  const attempt = await ctx.seedStartedAttempt(brandSchemas.phaseName.parse('build'));

  invariant(attempt.caller !== null, 'the started attempt holds its caller');

  const answer = await ctx.callCurrent(attempt.caller.subject);

  expect(answer).toStrictEqual({
    status: 200,
    body: { json: expect.objectContaining({ kind: 'attempt' }) },
  });
});

test('#readCallerProof gives another machine no attempt', async () => {
  const ctx = await setupTest();

  await ctx.seedStartedAttempt(brandSchemas.phaseName.parse('build'));

  const answer = await ctx.callCurrent('machine-other');

  expect(answer).toStrictEqual({
    status: 200,
    body: { json: { kind: 'refused', reason: 'no-attempt' } },
  });
});

test('#readCallerProof proves nobody with no trusted issuers section', async () => {
  const ctx = await setupTest();
  const answer = await readCallerProof(undefined, ctx.dispatch.clock);

  invariant(answer.kind === 'read', 'the proof is read');

  const caller = await answer.callerProof.prove(new Request('http://boxxy.test/rpc'));

  expect(caller).toBeNull();
});

test('#readCallerProof refuses a folder that does not exist', async () => {
  const ctx = await setupTest();

  const missing = path.join(ctx.folder, 'missing');

  const answer = await readCallerProof(
    { folders: [missing], audience: ctx.audience },
    ctx.dispatch.clock,
  );

  expect(answer).toStrictEqual({
    kind: 'refused',
    message: `no trusted issuers folder at ${missing}`,
  });
});

test('#readCallerProof throws on a trust document of the wrong shape', async () => {
  const ctx = await setupTest();

  await Bun.write(path.join(ctx.folder, 'issuer.json'), '{"issuer":"https://x.example.test"}');

  expect(
    readCallerProof({ folders: [ctx.folder], audience: ctx.audience }, ctx.dispatch.clock),
  ).rejects.toThrow();
});
