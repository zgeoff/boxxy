import type { ServerConfig } from './server-config-schema.ts';

export interface NoticeSecrets {
  // the notice session's gateway ID, `<daemon>.<incarnation>.<id>`
  readonly session: string;

  // the atc token of the notifier, which no other atc call sends
  readonly token: string;
}

interface ServerSecrets {
  readonly workerToken: string;
  readonly atcToken: string;

  // null: the configuration has no pepys section
  readonly pepysSigningSecret: string | null;

  // null: unset or empty, for a broker that adds the GitHub credential on the way out
  readonly githubToken: string | null;

  // null: no notice session is set, so the server sends no notice
  readonly notice: NoticeSecrets | null;

  // the noslop App's keys, by their variable names; null: none is set, so the server posts no
  // review and rejects each review close-out
  readonly review: Readonly<Record<string, string>> | null;
}

export type SecretsAnswer =
  | { readonly kind: 'found'; readonly secrets: ServerSecrets }

  // the name of each variable that is unset or empty, never a value
  | { readonly kind: 'missing'; readonly names: readonly string[] }

  // the name of a variable whose value has the wrong shape, never the value
  | { readonly kind: 'malformed'; readonly name: string };

// atc addresses a session only by its gateway ID, and answers `no_such_session` to a name
const gatewayID = /^[^.]+\.[^.]+\..+$/u;

const reviewNames = [
  'NOSLOP_GITHUB_APP_ID',
  'NOSLOP_GITHUB_APP_PRIVATE_KEY',
  'NOSLOP_GITHUB_APP_INSTALLATION_ID',
];

// The secrets come from the environment only. An empty token counts as missing. The notice
// session is unset only when its variable is absent; an empty one has the wrong shape. The noslop
// App's keys go together: once one is set, each is needed.
export function pickServerSecrets(
  config: ServerConfig,
  env: Readonly<Record<string, string | undefined>>,
): SecretsAnswer {
  const noticeSession = env['BOXXY_ATC_NOTICE_SESSION'];
  const hasReview = reviewNames.some((name) => env[name] !== undefined);

  const needed = [
    'BOXXY_WORKER_TOKEN',
    'BOXXY_ATC_TOKEN',
    ...(config.pepys === undefined ? [] : ['BOXXY_PEPYS_SIGNING_SECRET']),
    ...(noticeSession === undefined ? [] : ['BOXXY_ATC_NOTICE_TOKEN']),
    ...(hasReview ? reviewNames : []),
  ];

  const names = needed.filter((name) => (env[name] ?? '') === '');

  if (names.length > 0) {
    return { kind: 'missing', names };
  }

  if (noticeSession !== undefined && !gatewayID.test(noticeSession)) {
    return { kind: 'malformed', name: 'BOXXY_ATC_NOTICE_SESSION' };
  }

  return {
    kind: 'found',
    secrets: {
      workerToken: env['BOXXY_WORKER_TOKEN'] ?? '',
      atcToken: env['BOXXY_ATC_TOKEN'] ?? '',
      pepysSigningSecret:
        config.pepys === undefined ? null : (env['BOXXY_PEPYS_SIGNING_SECRET'] ?? ''),
      githubToken:
        (env['BOXXY_GITHUB_TOKEN'] ?? '') === '' ? null : (env['BOXXY_GITHUB_TOKEN'] ?? null),
      notice:
        noticeSession === undefined
          ? null
          : { session: noticeSession, token: env['BOXXY_ATC_NOTICE_TOKEN'] ?? '' },
      review: hasReview
        ? Object.fromEntries(reviewNames.map((name) => [name, env[name] ?? '']))
        : null,
    },
  };
}
