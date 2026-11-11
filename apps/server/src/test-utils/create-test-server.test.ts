import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { buildRPCRequest } from './build-rpc-request.ts';
import { createTestServer } from './create-test-server.ts';

test('it serves the owner listener on the memory store', async () => {
  const server = await createTestServer();
  const item = await server.dispatch.seedItem({});
  const response = await server.owner(buildRPCRequest({ procedure: 'item.get', input: { item } }));

  expect(response.status).toBe(200);
});

test('it answers PEPYS_NOT_CONFIGURED to a report when it runs with no pepys', async () => {
  const server = await createTestServer({ hasPepys: false });
  const item = await server.dispatch.seedItem({});

  const response = await server.owner(
    buildRPCRequest({ procedure: 'report.cost', input: { item } }),
  );

  const body = await response.json();

  expect({ status: response.status, body }).toStrictEqual({
    status: 501,
    body: {
      json: {
        defined: true,
        code: 'PEPYS_NOT_CONFIGURED',
        message: expect.any(String),
      },
    },
  });
});

test('it seeds an attempt whose session started, with the caller the session reports', async () => {
  const server = await createTestServer();
  const attempt = await server.seedStartedAttempt(brandSchemas.phaseName.parse('build'));

  expect({ state: attempt.state, caller: attempt.caller }).toStrictEqual({
    state: 'running',
    caller: { issuer: 'fake-worker', subject: expect.any(String) },
  });
});

test('it runs a tick at the time of the clock', async () => {
  const server = await createTestServer();

  await server.dispatch.seedItem({ phase: brandSchemas.phaseName.parse('build') });

  const report = await server.tick();

  expect(report.claimed).toBe(1);
});
