import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brandSchemas } from '@boxxy/model';
import { createFakePepysReader } from '@boxxy/model/test-utils/create-fake-pepys-reader';
import { createSQLiteClaimStore } from '@boxxy/store-sqlite';
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

test('it reads the reports from the pepys reader that the test passes', async () => {
  const reader = createFakePepysReader();

  reader.failNext('the pepys under test is down');

  const server = await createTestServer({ pepys: reader });
  const item = await server.dispatch.seedItem({});

  const response = await server.owner(
    buildRPCRequest({ procedure: 'report.cost', input: { item } }),
  );

  const body = await response.json();

  expect(body).toMatchObject({ json: { code: 'PEPYS_UNAVAILABLE' } });
});

test('it keeps its rows in the store that the test passes', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'boxxy-test-server-'));

  onTestFinished(() => rm(folder, { recursive: true, force: true }));

  const store = await createSQLiteClaimStore(join(folder, 'boxxy.db'));

  onTestFinished(() => store.close());

  const server = await createTestServer({ store });
  const item = await server.dispatch.seedItem({});

  const view = await store.read((tx) =>
    tx.readItem(item, server.dispatch.clock.now(), server.dispatch.rules()),
  );

  expect(view?.id).toBe(item);
});

test('it links a pull request of a build on one pass of the watch', async () => {
  const server = await createTestServer();
  const build = await server.dispatch.seedBuild();

  server.forge.seed({
    ref: { repo: brandSchemas.repoName.parse('example/app'), number: 3 },
    githubId: 9_000_003,
    reading: {
      state: 'open',
      mergedAt: null,
      mergeCommit: null,
      commits: [
        {
          sha: brandSchemas.commitSha.parse('c'.repeat(40)),
          message: `Follow the system theme\n\nBoxxy-Attempt: ${build.id}\n`,
        },
      ],
    },
  });

  const report = await server.watch();

  expect(report.linked).toBe(1);
});
