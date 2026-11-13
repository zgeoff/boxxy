import { expect, test } from 'bun:test';
import { generateKeyPairSync } from 'node:crypto';
import { pickServerSecrets } from './pick-server-secrets.ts';
import type { ServerConfig } from './server-config-schema.ts';

function setupTest() {
  // the parse checks the key's form only, so a small key keeps each test fast
  const privateKey = generateKeyPairSync('rsa', { modulusLength: 1024 }).privateKey.export({
    type: 'pkcs1',
    format: 'pem',
  });

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
    privateKey,
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
      noticeToken: null,
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
    BOXXY_GITHUB_APP_PRIVATE_KEY: ctx.privateKey,
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
        privateKey: ctx.privateKey,
        installationID: 4242,
      },
      noticeToken: null,
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

test.each(['0', '42a', '-7', '4.2', '99999999999999999999', '9007199254740993'])(
  'it names the App installation ID as malformed for a value that is no safe positive integer: "%s"',
  (installation) => {
    const ctx = setupTest();

    const answer = pickServerSecrets(ctx.config, {
      BOXXY_WORKER_TOKEN: 'worker-token-1',
      BOXXY_ATC_TOKEN: 'atc-token-1',
      BOXXY_GITHUB_APP_CLIENT_ID: 'Iv23liTestClient0001',
      BOXXY_GITHUB_APP_PRIVATE_KEY: ctx.privateKey,
      BOXXY_GITHUB_APP_INSTALLATION_ID: installation,
    });

    expect(answer).toStrictEqual({
      kind: 'malformed',
      name: 'BOXXY_GITHUB_APP_INSTALLATION_ID',
      expected: "the App installation's numeric ID",
    });
  },
);

test.each([' ', 'Iv23li Test', ' Iv23liTestClient0001'])(
  'it names the App client ID as malformed for a value with white space: "%s"',
  (clientID) => {
    const ctx = setupTest();

    const answer = pickServerSecrets(ctx.config, {
      BOXXY_WORKER_TOKEN: 'worker-token-1',
      BOXXY_ATC_TOKEN: 'atc-token-1',
      BOXXY_GITHUB_APP_CLIENT_ID: clientID,
      BOXXY_GITHUB_APP_PRIVATE_KEY: ctx.privateKey,
      BOXXY_GITHUB_APP_INSTALLATION_ID: '4242',
    });

    expect(answer).toStrictEqual({
      kind: 'malformed',
      name: 'BOXXY_GITHUB_APP_CLIENT_ID',
      expected: "the App's client ID",
    });
  },
);

test.each([
  { key: 'test-private-key', title: 'no PEM' },
  {
    key: '-----BEGIN RSA PRIVATE KEY-----\nbm90IGEga2V5\n-----END RSA PRIVATE KEY-----',
    title: 'a PEM that holds no key',
  },
  {
    key: generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({
      type: 'pkcs8',
      format: 'pem',
    }),
    title: 'an EC key, which cannot sign RS256',
  },
])('it names the App private key as malformed for $title, and prints no value', (row) => {
  const ctx = setupTest();

  const answer = pickServerSecrets(ctx.config, {
    BOXXY_WORKER_TOKEN: 'worker-token-1',
    BOXXY_ATC_TOKEN: 'atc-token-1',
    BOXXY_GITHUB_APP_CLIENT_ID: 'Iv23liTestClient0001',
    BOXXY_GITHUB_APP_PRIVATE_KEY: row.key,
    BOXXY_GITHUB_APP_INSTALLATION_ID: '4242',
  });

  expect(answer).toStrictEqual({
    kind: 'malformed',
    name: 'BOXXY_GITHUB_APP_PRIVATE_KEY',
    expected: "the App's RSA private key, in PEM form",
  });
});

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
      noticeToken: null,
      review: null,
    },
  });
});

test('it reads the notice token when it is set', () => {
  const ctx = setupTest();

  const answer = pickServerSecrets(ctx.config, {
    BOXXY_WORKER_TOKEN: 'worker-token-1',
    BOXXY_ATC_TOKEN: 'atc-token-1',
    BOXXY_ATC_NOTICE_TOKEN: 'notice-token-1',
  });

  expect(answer).toStrictEqual({
    kind: 'found',
    secrets: {
      workerToken: 'worker-token-1',
      atcToken: 'atc-token-1',
      pepysSigningSecret: null,
      githubApp: null,
      noticeToken: 'notice-token-1',
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
      noticeToken: null,
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

test('it names the notice token as missing when it is set and empty', () => {
  const ctx = setupTest();

  const answer = pickServerSecrets(ctx.config, {
    BOXXY_WORKER_TOKEN: 'worker-token-1',
    BOXXY_ATC_TOKEN: 'atc-token-1',
    BOXXY_ATC_NOTICE_TOKEN: '',
  });

  expect(answer).toStrictEqual({ kind: 'missing', names: ['BOXXY_ATC_NOTICE_TOKEN'] });
});

test.each(['desk.3.s7', 'owner-desk', ''])(
  'it names the notice session variable as retired while it is set to "%s", and prints no value',
  (session) => {
    const ctx = setupTest();

    const answer = pickServerSecrets(ctx.config, {
      BOXXY_WORKER_TOKEN: 'worker-token-1',
      BOXXY_ATC_TOKEN: 'atc-token-1',
      BOXXY_ATC_NOTICE_SESSION: session,
      BOXXY_ATC_NOTICE_TOKEN: 'notice-token-1',
    });

    expect(answer).toStrictEqual({
      kind: 'retired',
      name: 'BOXXY_ATC_NOTICE_SESSION',
      instead: 'register the notice session with `boxxy notices register <gateway-id>`',
    });
  },
);
