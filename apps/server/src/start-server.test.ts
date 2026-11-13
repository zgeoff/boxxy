import { expect, onTestFinished, test } from 'bun:test';
import { generateKeyPairSync } from 'node:crypto';
import { cp, mkdir, mkdtemp, rm, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildJobRulesText } from '@boxxy/dispatch/test-utils/build-job-rules-text';
import { createFakeClock } from '@boxxy/dispatch/test-utils/create-fake-clock';
import { createTestDispatch } from '@boxxy/dispatch/test-utils/create-test-dispatch';
import { brandSchemas } from '@boxxy/model';
import { createSQLiteClaimStore } from '@boxxy/store-sqlite';
import { createFakeAtc } from '@boxxy/worker-atc/test-utils/create-fake-atc';
import { createFakeAtcServer } from '@boxxy/worker-atc/test-utils/create-fake-atc-server';
import invariant from 'tiny-invariant';
import { startServer } from './start-server.ts';
import { readHttpStatus } from './test-utils/read-http-status.ts';
import { waitFor } from './test-utils/wait-for.ts';

async function setupTest() {
  const folder = await mkdtemp(path.join(tmpdir(), 'boxxy-test-server-'));

  const rulesFolder = path.join(folder, 'rules');
  const configFile = path.join(folder, 'boxxy.json');

  const example = path.dirname(
    Bun.fileURLToPath(import.meta.resolve('@boxxy/rules/example/rules.yaml')),
  );

  onTestFinished(() => rm(folder, { recursive: true, force: true }));

  await cp(example, rulesFolder, { recursive: true });

  const config = {
    runner: 'runner-1',
    store: { file: path.join(folder, 'boxxy.db') },
    rules: { folder: rulesFolder },
    api: {
      listen: { hostname: '127.0.0.1', port: 0 },
      workerListen: { hostname: '127.0.0.1', port: 0 },
    },
    spawn: { target: 'cloud', repos: {} },
    atc: { url: 'http://127.0.0.1:9/mcp', trustedFolders: {} },
  };

  await Bun.write(configFile, JSON.stringify(config));

  const env = {
    BOXXY_CONFIG: configFile,
    BOXXY_WORKER_TOKEN: 'worker-token-1',
    BOXXY_ATC_TOKEN: 'atc-token-1',
  };

  const logged: string[] = [];

  return {
    env,
    folder,
    logged,

    // writes the configuration file again, with the given sections added
    addConfigSections: (sections: Readonly<Record<string, unknown>>) =>
      Bun.write(configFile, JSON.stringify({ ...config, ...sections })),

    // writes the rules file again, with a merge step after review on the merge job worker
    addMergeStep: async () => {
      const rulesFile = path.join(rulesFolder, 'rules.yaml');

      const text = await Bun.file(rulesFile).text();

      await Bun.write(rulesFile, buildJobRulesText(text));
    },
    start: async (overrides: Readonly<Record<string, string | undefined>>) => {
      const answer = await startServer({
        env: { ...env, ...overrides },
        log: {
          warn: (message) => {
            logged.push(message);
          },
        },
      });

      if (answer.kind === 'started') {
        onTestFinished(() => answer.server.stop());
      }

      return answer;
    },
  };
}

test('it refuses to start with no configuration path', async () => {
  const ctx = await setupTest();
  const answer = await ctx.start({ BOXXY_CONFIG: undefined });

  expect(answer).toStrictEqual({
    kind: 'refused',
    message: 'set BOXXY_CONFIG to the path of the configuration file',
  });
});

test('it names each missing secret and prints no secret value', async () => {
  const ctx = await setupTest();
  const answer = await ctx.start({ BOXXY_WORKER_TOKEN: '', BOXXY_ATC_TOKEN: undefined });

  expect(answer).toStrictEqual({
    kind: 'refused',
    message: 'set these variables: BOXXY_WORKER_TOKEN, BOXXY_ATC_TOKEN',
  });
});

test('it refuses to start while the configuration file still holds noticeSession, and names the key', async () => {
  const ctx = await setupTest();

  await ctx.addConfigSections({
    atc: { url: 'http://127.0.0.1:9/mcp', trustedFolders: {}, noticeSession: 'owner-desk' },
  });

  const answer = await ctx.start({});

  expect(answer).toStrictEqual({
    kind: 'refused',
    message: expect.stringContaining('noticeSession'),
  });
});

test('it refuses to start when the notice token is set and empty', async () => {
  const ctx = await setupTest();
  const answer = await ctx.start({ BOXXY_ATC_NOTICE_TOKEN: '' });

  expect(answer).toStrictEqual({
    kind: 'refused',
    message: 'set these variables: BOXXY_ATC_NOTICE_TOKEN',
  });
});

test('it refuses to start while BOXXY_ATC_NOTICE_SESSION is still set, and prints no value', async () => {
  const ctx = await setupTest();

  const answer = await ctx.start({
    BOXXY_ATC_NOTICE_SESSION: 'desk.3.s7',
    BOXXY_ATC_NOTICE_TOKEN: 'notice-token-1',
  });

  expect(answer).toStrictEqual({
    kind: 'refused',
    message:
      'unset BOXXY_ATC_NOTICE_SESSION: register the notice session with `boxxy notices register <gateway-id>`',
  });
});

test('it starts and stops with a notice token and no registered notice session', async () => {
  const ctx = await setupTest();
  const answer = await ctx.start({ BOXXY_ATC_NOTICE_TOKEN: 'notice-token-1' });

  expect(answer.kind).toBe('started');
});

test('it starts with a review agent that only the review recipe names', async () => {
  const ctx = await setupTest();

  await ctx.addConfigSections({
    spawn: { target: 'cloud', repos: {}, reviewAgents: ['claude-review'] },
  });

  const answer = await ctx.start({});

  expect(answer.kind).toBe('started');
});

test('it refuses to start when a build recipe names a review agent', async () => {
  const ctx = await setupTest();

  await ctx.addConfigSections({
    spawn: { target: 'cloud', repos: {}, reviewAgents: ['claude-review', 'claude'] },
  });

  const answer = await ctx.start({});

  expect(answer).toStrictEqual({
    kind: 'refused',
    message: expect.stringContaining('review-agent-outside-review'),
  });
});

test('it refuses to start when the trusted issuers folders hold no document, and names them', async () => {
  const ctx = await setupTest();

  const issuers = path.join(ctx.folder, 'issuers');

  await mkdir(issuers);

  await ctx.addConfigSections({
    trustedIssuers: { folders: [issuers], audience: 'boxxy.example.test' },
  });

  const answer = await ctx.start({});

  expect(answer).toStrictEqual({
    kind: 'refused',
    message: `no trust document in ${issuers}`,
  });
});

test('it refuses to start on a trust document symlink that points nowhere, and names it', async () => {
  const ctx = await setupTest();

  const issuers = path.join(ctx.folder, 'issuers');

  await mkdir(issuers);
  await symlink('missing.json', path.join(issuers, 'issuer.json'));

  await ctx.addConfigSections({
    trustedIssuers: { folders: [issuers], audience: 'boxxy.example.test' },
  });

  const answer = await ctx.start({});

  expect(answer).toStrictEqual({
    kind: 'refused',
    message: `the trust document at ${path.join(issuers, 'issuer.json')} points nowhere`,
  });
});

test('it starts and stops with a github section and the boxxy App keys', async () => {
  const ctx = await setupTest();

  await ctx.addConfigSections({ github: { baseUrl: 'http://127.0.0.1:9' } });

  const privateKey = generateKeyPairSync('rsa', { modulusLength: 1024 }).privateKey.export({
    type: 'pkcs1',
    format: 'pem',
  });

  const answer = await ctx.start({
    BOXXY_GITHUB_APP_CLIENT_ID: 'Iv23liTestClient0001',
    BOXXY_GITHUB_APP_PRIVATE_KEY: privateKey,
    BOXXY_GITHUB_APP_INSTALLATION_ID: '4242',
  });

  expect(answer.kind).toBe('started');
});

test('it starts with rules that hold a merge step when the configuration has a github section', async () => {
  const ctx = await setupTest();

  await ctx.addMergeStep();
  await ctx.addConfigSections({ github: { baseUrl: 'http://127.0.0.1:9' } });

  const answer = await ctx.start({});

  expect(answer.kind).toBe('started');
});

test('it refuses rules that hold a merge step when the configuration has no github section', async () => {
  const ctx = await setupTest();

  await ctx.addMergeStep();

  const answer = await ctx.start({});

  expect(answer).toStrictEqual({
    kind: 'refused',
    message: expect.stringContaining('unknown-worker'),
  });
});

test('it refuses to start with only some boxxy App keys, and prints no value', async () => {
  const ctx = await setupTest();
  const answer = await ctx.start({ BOXXY_GITHUB_APP_PRIVATE_KEY: 'test-private-key' });

  expect(answer).toStrictEqual({
    kind: 'refused',
    message: 'set these variables: BOXXY_GITHUB_APP_CLIENT_ID, BOXXY_GITHUB_APP_INSTALLATION_ID',
  });
});

test('it starts both listeners on the ports the system picks', async () => {
  const ctx = await setupTest();
  const answer = await ctx.start({});

  invariant(answer.kind === 'started', 'the server starts');

  expect([answer.server.ownerPort, answer.server.workerPort]).toSatisfyAll(
    (port: number) => port > 0,
  );
});

test('it starts no public door when the configuration has none', async () => {
  const ctx = await setupTest();
  const answer = await ctx.start({});

  invariant(answer.kind === 'started', 'the server starts');

  expect(answer.server.publicPort).toBeNull();
});

test('it serves the MCP route and nothing else on the public door, on a port of its own', async () => {
  const ctx = await setupTest();

  await ctx.addConfigSections({
    publicDoor: {
      port: 0,
      publicURL: 'http://127.0.0.1:4455',
      authFile: path.join(ctx.folder, 'auth.db'),
    },
  });

  const answer = await ctx.start({});

  invariant(answer.kind === 'started', 'the server starts');
  invariant(answer.server.publicPort !== null, 'the server runs a public door');

  const base = `http://127.0.0.1:${answer.server.publicPort}`;

  const mcp = await readHttpStatus(`${base}/mcp`, 'POST');
  const rpc = await readHttpStatus(`${base}/rpc/item/list`, 'POST');
  const health = await readHttpStatus(`${base}/healthz`, 'GET');

  expect([mcp, rpc, health, answer.server.publicPort]).toStrictEqual([
    401,
    404,
    404,
    expect.not.toBeOneOf([answer.server.ownerPort, answer.server.workerPort]),
  ]);
});

test('it keeps the auth database next to the store with mode 0600 when the configuration names no file', async () => {
  const ctx = await setupTest();

  await ctx.addConfigSections({
    publicDoor: { port: 0, publicURL: 'http://127.0.0.1:4455' },
  });

  await ctx.start({});

  const info = await stat(path.join(ctx.folder, 'boxxy-auth.db'));

  expect(info.mode & 0o777).toBe(0o600);
});

test('it refuses to start a public door that listens beyond loopback with a plain http address', async () => {
  const ctx = await setupTest();

  await ctx.addConfigSections({
    publicDoor: { port: 0, hostname: '0.0.0.0', publicURL: 'http://127.0.0.1:4455' },
  });

  const answer = await ctx.start({});

  expect(answer).toStrictEqual({
    kind: 'refused',
    message: expect.stringContaining('the public door needs an https public URL'),
  });
});

test('it spawns a filed item on atc over MCP with the host name and the bearer and no warning', async () => {
  const ctx = await setupTest();

  const atc = createFakeAtc({ clock: createFakeClock(), targets: { cloud: 'suspending' } });
  const atcServer = createFakeAtcServer({ atc, token: 'atcs_test-token-0123', host: 'atc.test' });

  onTestFinished(() => atcServer.stop());

  await ctx.addConfigSections({
    spawn: { target: 'cloud', repos: { 'example/app': '/tmp/boxxy-test/repos/app' } },
    atc: {
      url: atcServer.url,
      host: 'atc.test',
      trustedFolders: { cloud: ['/tmp/boxxy-test/repos'] },
    },
  });

  const store = await createSQLiteClaimStore(path.join(ctx.folder, 'boxxy.db'));

  onTestFinished(() => store.close());

  const dispatch = await createTestDispatch({ store });

  await dispatch.seedItem({});
  await store.close();

  const answer = await ctx.start({ BOXXY_ATC_TOKEN: 'atcs_test-token-0123' });

  invariant(answer.kind === 'started', 'the server starts on the stand-in atc');

  await waitFor(() => atc.calls.some((call) => call.tool === 'atc_session_spawn'), 4000);

  expect([
    atc.calls.find((call) => call.tool === 'atc_session_spawn')?.args,
    atcServer.requests.every(
      (request) =>
        request.host === 'atc.test' && request.authorization === 'Bearer atcs_test-token-0123',
    ),
    ctx.logged,
  ]).toStrictEqual([
    expect.objectContaining({
      target: 'cloud',
      cwd: '/tmp/boxxy-test/repos/app',
      name: expect.stringMatching(/^boxxy\//u),
    }),
    true,
    [],
  ]);
});

test('it spawns a repo with a git source as an atc workspace that atc trusts, with no cwd', async () => {
  const ctx = await setupTest();

  const atc = createFakeAtc({ clock: createFakeClock(), targets: { cloud: 'suspending' } });
  const atcServer = createFakeAtcServer({ atc, token: 'atcs_test-token-0123', host: 'atc.test' });

  onTestFinished(() => atcServer.stop());

  await ctx.addConfigSections({
    spawn: {
      target: 'cloud',
      repos: { 'example/app': { url: 'https://git.example.test/example/app.git', ref: 'main' } },
    },
    atc: {
      url: atcServer.url,
      host: 'atc.test',
      trustedFolders: { cloud: ['/tmp/boxxy-test/repos'] },
    },
  });

  const store = await createSQLiteClaimStore(path.join(ctx.folder, 'boxxy.db'));

  onTestFinished(() => store.close());

  const dispatch = await createTestDispatch({ store });

  await dispatch.seedItem({});
  await store.close();

  const answer = await ctx.start({ BOXXY_ATC_TOKEN: 'atcs_test-token-0123' });

  invariant(answer.kind === 'started', 'the server starts on the stand-in atc');

  await waitFor(() => atc.calls.some((call) => call.tool === 'atc_session_spawn'), 4000);

  expect(atc.calls.find((call) => call.tool === 'atc_session_spawn')?.args).toStrictEqual({
    target: 'cloud',
    workspace: { kind: 'git', url: 'https://git.example.test/example/app.git', ref: 'main' },
    trustClonedWorkspace: true,
    name: expect.stringMatching(/^boxxy\//u),
    prompt: expect.any(String),
    agent: expect.any(String),
    model: expect.any(String),
    effort: expect.any(String),
    idempotencyKey: expect.any(String),
  });
});

test('it sends a hold notice to the notice session that the store holds, with the notice token', async () => {
  const ctx = await setupTest();

  const atc = createFakeAtc({ clock: createFakeClock(), targets: { cloud: 'suspending' } });

  // the gateway takes the notice token alone, with the message scope alone
  const atcServer = createFakeAtcServer({
    atc,
    token: 'atcs_notice-token-0123',
    host: 'atc.test',
    scopes: ['message'],
  });

  onTestFinished(() => atcServer.stop());

  await ctx.addConfigSections({
    atc: { url: atcServer.url, host: 'atc.test', trustedFolders: {} },
  });

  const store = await createSQLiteClaimStore(path.join(ctx.folder, 'boxxy.db'));

  onTestFinished(() => store.close());

  const at = brandSchemas.instant.parse(0);

  await store.exclusive((tx) =>
    tx.applyChange({
      at,
      writes: [
        {
          op: 'insert',
          table: 'notices',
          row: {
            id: 1,
            item: brandSchemas.itemId.parse('0190a6f4-0000-7000-8000-0000000000a1'),
            reason: brandSchemas.rulesHoldReason.parse('blocked'),
            at,
            tries: 0,
            sentAt: null,
            keySeq: 0,
            keyTries: 0,
            nextTryAt: at,
          },
        },
      ],
      facts: [],
    }),
  );

  await store.exclusive((tx) => tx.writeNoticeSession({ gatewayID: 'desk.3.s7', setAt: at }));
  await store.close();

  const answer = await ctx.start({
    BOXXY_ATC_TOKEN: 'atcs_worker-token-0123',
    BOXXY_ATC_NOTICE_TOKEN: 'atcs_notice-token-0123',
  });

  invariant(answer.kind === 'started', 'the server starts on the stand-in atc');

  await waitFor(() => atc.calls.some((call) => call.tool === 'atc_message_send'), 4000);

  expect(atc.calls.find((call) => call.tool === 'atc_message_send')?.args).toStrictEqual({
    session: 'desk.3.s7',
    text: expect.stringContaining('0190a6f4-0000-7000-8000-0000000000a1'),
    idempotencyKey: 'boxxy-notice:1:0',
  });
});
