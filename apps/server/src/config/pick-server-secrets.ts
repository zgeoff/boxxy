import type { ServerConfig } from './server-config-schema.ts';

interface ServerSecrets {
  readonly workerToken: string;
  readonly atcToken: string;

  // null: the configuration has no pepys section
  readonly pepysSigningSecret: string | null;

  // null: unset or empty, for a broker that adds the GitHub credential on the way out
  readonly githubToken: string | null;
}

export type SecretsAnswer =
  | { readonly kind: 'found'; readonly secrets: ServerSecrets }

  // the name of each variable that is unset or empty, never a value
  | { readonly kind: 'missing'; readonly names: readonly string[] };

// The secrets come from the environment only. An empty variable counts as missing.
export function pickServerSecrets(
  config: ServerConfig,
  env: Readonly<Record<string, string | undefined>>,
): SecretsAnswer {
  const needed = [
    'BOXXY_WORKER_TOKEN',
    'BOXXY_ATC_TOKEN',
    ...(config.pepys === undefined ? [] : ['BOXXY_PEPYS_SIGNING_SECRET']),
  ];

  const names = needed.filter((name) => (env[name] ?? '') === '');

  if (names.length > 0) {
    return { kind: 'missing', names };
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
    },
  };
}
