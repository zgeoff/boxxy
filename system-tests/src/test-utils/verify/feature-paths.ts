// Globs are root-relative, as `git ls-files` prints them, and match with Bun.Glob. A package is in
// a feature when the feature's journey runs code in it. The harness runs the fakes in a package's
// src/test-utils/, so a package's whole folder maps, its test-utils included.

// Every journey files an item through the CLI and the server, and reads it back.
const everyJourney = [
  'apps/cli/**',
  'apps/server/**',
  'libs/**',
  'adapters/store-sqlite/**',

  // the example rules and their prompts, which the harness loads
  'modules/rules/**',
  'modules/dispatch/**',

  // the phase kinds, which the server loads with the rules, and the merge rule of one of them
  'modules/closeout/**',
  'modules/train/**',

  // the verify CLI and its harness, the broker routing and pepys under test: a change here changes
  // what a journey proves
  'system-tests/src/test-utils/**',
] as const;

export const featurePaths = {
  'file-item': [...everyJourney],
  'claim-settle': [...everyJourney, 'modules/planning/**'],
  'report-cost': [...everyJourney, 'modules/planning/**', 'packages/pepys/**'],
} as const satisfies Record<string, readonly string[]>;

// A path that one of these globs matches counts as no change, even where a feature's globs match
// it too.
export const ignoredPaths = [
  // 1. No runtime effect: prose, tests and benches. Never `**/*.md`: the rules' prompts are
  //    markdown that the server sends to each session.
  'docs/**',
  '**/README.md',
  '**/CHANGELOG.md',
  'AGENTS.md',
  'CLAUDE.md',
  '**/LICENSE',
  '**/*.test.ts',
  '**/bench/**',
  'system-tests/e2e/**',

  // 2. Build, lint and repo wiring, which Bun never reads when it runs the source.
  '**/tsconfig*.json',
  '**/turbo.json',
  'bunfig.toml',
  'rig.config.ts',
  'knip.json',
  '.oxlintrc.json',
  'oxfmt.config.ts',
  '.formatignore',
  '.editorconfig',
  '.gitattributes',
  '.gitignore',
  '.gitleaks.toml',
  'commitlint.config.js',
  'lefthook.yml',
  '.lefthook/**',
  'audit-ignores.json',
  'socket.yml',
  'review.json',
  'renovate.json',

  // the skills, the verify skill's feature map among them
  '.claude/**',
  '.github/**',
  'scripts/**',

  // 3. The files that Renovate (the root catalog, the lock file, the Bun pin) and release-please
  //    (each package's version, the manifest) change. A patch or minor bump merges on green CI, and
  //    a major bump or a new Bun version gets the owner's review, with the system tests in CI.
  '**/package.json',
  'bun.lock',
  '.bun-version',
  '.release-please-manifest.json',
  'release-please-config.json',

  // 4. Code that no journey runs: the harness runs fakes in place of the adapters, and composes
  //    the server itself, so the server's own start, config, timers and rules loader never run.
  //    Their own tests, the system test of the server's start and the live proof cover them.
  'adapters/worker-atc/**',
  'adapters/auth-oauth/**',
  'adapters/caller-proof-imp/**',
  'adapters/notifier-atc/**',
  'adapters/forge-github/**',
  'adapters/review-noslop/**',
  'adapters/verifier-wringer/**',
  'apps/server/src/{main,start-server,no-caller-proof,create-capacity-backoff}.ts',
  'apps/server/src/config/**',
  'apps/server/src/rules/{create-rules-holder,read-rules-checkout}.ts',
  'apps/server/src/tick/start-tick-loop.ts',
  'apps/server/src/outbox/start-outbox-sender.ts',
] as const;
