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
    spawn: { target: 'cloud', repos: {} },
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
      githubToken: null,
      notice: null,
      review: null,
    },
  });
});

test('it reads the GitHub token when one is set', () => {
  const ctx = setupTest();

  const answer = pickServerSecrets(ctx.config, {
    BOXXY_WORKER_TOKEN: 'worker-token-1',
    BOXXY_ATC_TOKEN: 'atc-token-1',
    BOXXY_GITHUB_TOKEN: 'github-token-1',
  });

  expect(answer).toStrictEqual({
    kind: 'found',
    secrets: {
      workerToken: 'worker-token-1',
      atcToken: 'atc-token-1',
      pepysSigningSecret: null,
      githubToken: 'github-token-1',
      notice: null,
      review: null,
    },
  });
});

test('it reads an empty GitHub token as none', () => {
  const ctx = setupTest();

  const answer = pickServerSecrets(ctx.config, {
    BOXXY_WORKER_TOKEN: 'worker-token-1',
    BOXXY_ATC_TOKEN: 'atc-token-1',
    BOXXY_GITHUB_TOKEN: '',
  });

  expect(answer).toStrictEqual({
    kind: 'found',
    secrets: {
      workerToken: 'worker-token-1',
      atcToken: 'atc-token-1',
      pepysSigningSecret: null,
      githubToken: null,
      notice: null,
      review: null,
    },
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
      githubToken: null,
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
      githubToken: null,
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
      githubToken: null,
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

    expect(answer).toStrictEqual({ kind: 'malformed', name: 'BOXXY_ATC_NOTICE_SESSION' });
  },
);
