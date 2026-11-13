import { expect, test } from 'bun:test';
import { pickServerSecrets } from './pick-server-secrets.ts';
import type { ServerConfig } from './server-config-schema.ts';

function setupTest() {
  const config: ServerConfig = {
    runner: 'runner-1',
    store: { file: '/tmp/boxxy-test/boxxy.db' },
    rules: { folder: '/tmp/boxxy-test/rules', ref: 'origin/main' },
    api: {
      listen: { hostname: '127.0.0.1', port: 4400 },
      workerListen: { hostname: '127.0.0.1', port: 4401 },
    },
    spawn: { target: 'cloud', repos: {}, reviewAgents: [] },
    atc: { url: 'http://127.0.0.1:7777/mcp', trustedFolders: {} },
  };

  return {
    config,
    withPepys: {
      ...config,
      pepys: {
        ingestUrl: 'https://pepys.test/ingest/boxxy',
        apiUrl: 'https://pepys.test',
        environment: 'production',
      },
    },
  };
}

test('it reads the two tokens when the configuration has no pepys section', () => {
  const ctx = setupTest();

  const answer = pickServerSecrets(ctx.config, {
    BOXXY_WORKER_TOKEN: 'worker-token-1',
    BOXXY_ATC_TOKEN: 'atc-token-1',
  });

  expect(answer).toStrictEqual({
    kind: 'found',
    secrets: {
      workerToken: 'worker-token-1',
      atcToken: 'atc-token-1',
      pepysSigningSecret: null,
      githubApp: null,
      notice: null,
      review: null,
    },
  });
});

test('it reads the three boxxy App keys when they are set', () => {
  const ctx = setupTest();

  const answer = pickServerSecrets(ctx.config, {
    BOXXY_WORKER_TOKEN: 'worker-token-1',
    BOXXY_ATC_TOKEN: 'atc-token-1',
    BOXXY_GITHUB_APP_CLIENT_ID: 'Iv23liTestClient0001',
    BOXXY_GITHUB_APP_PRIVATE_KEY: 'test-private-key',
    BOXXY_GITHUB_APP_INSTALLATION_ID: '4242',
  });

  expect(answer).toStrictEqual({
    kind: 'found',
    secrets: {
      workerToken: 'worker-token-1',
      atcToken: 'atc-token-1',
      pepysSigningSecret: null,
      githubApp: {
        clientID: 'Iv23liTestClient0001',
        privateKey: 'test-private-key',
        installationID: 4242,
      },
      notice: null,
      review: null,
    },
  });
});

test('it names the other boxxy App keys as missing when only one is set, an empty one included', () => {
  const ctx = setupTest();

  const answer = pickServerSecrets(ctx.config, {
    BOXXY_WORKER_TOKEN: 'worker-token-1',
    BOXXY_ATC_TOKEN: 'atc-token-1',
    BOXXY_GITHUB_APP_CLIENT_ID: '',
  });

  expect(answer).toStrictEqual({
    kind: 'missing',
    names: [
      'BOXXY_GITHUB_APP_CLIENT_ID',
      'BOXXY_GITHUB_APP_PRIVATE_KEY',
      'BOXXY_GITHUB_APP_INSTALLATION_ID',
    ],
  });
});

test.each(['0', '42a', '-7', '4.2'])(
  'it names the App installation ID as malformed for a value that is no positive integer: "%s"',
  (installation) => {
    const ctx = setupTest();

    const answer = pickServerSecrets(ctx.config, {
      BOXXY_WORKER_TOKEN: 'worker-token-1',
      BOXXY_ATC_TOKEN: 'atc-token-1',
      BOXXY_GITHUB_APP_CLIENT_ID: 'Iv23liTestClient0001',
      BOXXY_GITHUB_APP_PRIVATE_KEY: 'test-private-key',
      BOXXY_GITHUB_APP_INSTALLATION_ID: installation,
    });

    expect(answer).toStrictEqual({
      kind: 'malformed',
      name: 'BOXXY_GITHUB_APP_INSTALLATION_ID',
      expected: "the App installation's numeric ID",
    });
  },
);

test('it names each missing variable, an empty one included', () => {
  const ctx = setupTest();
  const answer = pickServerSecrets(ctx.withPepys, { BOXXY_WORKER_TOKEN: '' });

  expect(answer).toStrictEqual({
    kind: 'missing',
    names: ['BOXXY_WORKER_TOKEN', 'BOXXY_ATC_TOKEN', 'BOXXY_PEPYS_SIGNING_SECRET'],
  });
});

test('it reads the signing secret when the configuration has a pepys section', () => {
  const ctx = setupTest();

  const answer = pickServerSecrets(ctx.withPepys, {
    BOXXY_WORKER_TOKEN: 'worker-token-1',
    BOXXY_ATC_TOKEN: 'atc-token-1',
    BOXXY_PEPYS_SIGNING_SECRET: 'signing-secret-1',
  });

  expect(answer).toStrictEqual({
    kind: 'found',
    secrets: {
      workerToken: 'worker-token-1',
      atcToken: 'atc-token-1',
      pepysSigningSecret: 'signing-secret-1',
      githubApp: null,
      notice: null,
      review: null,
    },
  });
});

test('it reads the notice session and its own token when both are set', () => {
  const ctx = setupTest();

  const answer = pickServerSecrets(ctx.config, {
    BOXXY_WORKER_TOKEN: 'worker-token-1',
    BOXXY_ATC_TOKEN: 'atc-token-1',
    BOXXY_ATC_NOTICE_SESSION: 'desk.3.s7',
    BOXXY_ATC_NOTICE_TOKEN: 'notice-token-1',
  });

  expect(answer).toStrictEqual({
    kind: 'found',
    secrets: {
      workerToken: 'worker-token-1',
      atcToken: 'atc-token-1',
      pepysSigningSecret: null,
      githubApp: null,
      notice: { session: 'desk.3.s7', token: 'notice-token-1' },
      review: null,
    },
  });
});

test('it reads the three noslop App keys when they are set', () => {
  const ctx = setupTest();

  const answer = pickServerSecrets(ctx.config, {
    BOXXY_WORKER_TOKEN: 'worker-token-1',
    BOXXY_ATC_TOKEN: 'atc-token-1',
    NOSLOP_GITHUB_APP_ID: '101',
    NOSLOP_GITHUB_APP_PRIVATE_KEY: 'test-private-key',
    NOSLOP_GITHUB_APP_INSTALLATION_ID: '202',
  });

  expect(answer).toStrictEqual({
    kind: 'found',
    secrets: {
      workerToken: 'worker-token-1',
      atcToken: 'atc-token-1',
      pepysSigningSecret: null,
      githubApp: null,
      notice: null,
      review: {
        NOSLOP_GITHUB_APP_ID: '101',
        NOSLOP_GITHUB_APP_PRIVATE_KEY: 'test-private-key',
        NOSLOP_GITHUB_APP_INSTALLATION_ID: '202',
      },
    },
  });
});

test('it names the other noslop App keys as missing when only one is set', () => {
  const ctx = setupTest();

  const answer = pickServerSecrets(ctx.config, {
    BOXXY_WORKER_TOKEN: 'worker-token-1',
    BOXXY_ATC_TOKEN: 'atc-token-1',
    NOSLOP_GITHUB_APP_ID: '101',
  });

  expect(answer).toStrictEqual({
    kind: 'missing',
    names: ['NOSLOP_GITHUB_APP_PRIVATE_KEY', 'NOSLOP_GITHUB_APP_INSTALLATION_ID'],
  });
});

test.each([
  { token: undefined, title: 'unset' },
  { token: '', title: 'empty' },
])(
  'it names the notice token as missing when a notice session is set and the token is $title',
  (row) => {
    const ctx = setupTest();

    const answer = pickServerSecrets(ctx.config, {
      BOXXY_WORKER_TOKEN: 'worker-token-1',
      BOXXY_ATC_TOKEN: 'atc-token-1',
      BOXXY_ATC_NOTICE_SESSION: 'desk.3.s7',
      BOXXY_ATC_NOTICE_TOKEN: row.token,
    });

    expect(answer).toStrictEqual({ kind: 'missing', names: ['BOXXY_ATC_NOTICE_TOKEN'] });
  },
);

test.each(['owner-desk', 'desk.3', ''])(
  'it names the notice session as malformed for a value that is no gateway ID: "%s"',
  (session) => {
    const ctx = setupTest();

    const answer = pickServerSecrets(ctx.config, {
      BOXXY_WORKER_TOKEN: 'worker-token-1',
      BOXXY_ATC_TOKEN: 'atc-token-1',
      BOXXY_ATC_NOTICE_SESSION: session,
      BOXXY_ATC_NOTICE_TOKEN: 'notice-token-1',
    });

    expect(answer).toStrictEqual({
      kind: 'malformed',
      name: 'BOXXY_ATC_NOTICE_SESSION',
      expected: "the session's gateway ID, <daemon>.<incarnation>.<id>",
    });
  },
);
