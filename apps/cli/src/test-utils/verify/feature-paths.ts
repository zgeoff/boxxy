import { join } from 'node:path';
import { collectReachedFolders } from './collect-reached-folders.ts';
import { corePaths } from './core-paths.ts';
import { readWorkspacePackages } from './read-workspace-packages.ts';

// Globs are root-relative, as `git ls-files` prints them, and match with Bun.Glob. A feature's file
// that every `up` loads, such as a CLI command, loads in its own journey too, so a load failure
// fails that journey. Name a feature's files one by one, so a new file stays unmapped.
const coreGlobs = await readCoreGlobs(join(import.meta.dir, '..', '..', '..', '..', '..'));

// the tick that claims, settles, watches and merges, and the verifier that the test server builds:
// the tick's merge job reads the verify gate through it, and so does a session's verdict evidence
const tick = [
  'apps/server/src/tick/run-tick.ts',
  'adapters/verifier-wringer/src/{create-wringer-verifier,index,types}.ts',
];

// a session's start hook, its close-out and its reads, as the harness runs them
const session = [
  ...tick,
  'apps/cli/src/commands/{attempt-commands,describe-checked-refusal,describe-close-out-problem,hook-commands}.ts',
  'apps/cli/src/hooks/{build-skill-exclude,format-session-guide,install-skills,parse-hook-payload,pick-pull-request-url,run-post-tool-use-hook,run-session-start-hook,wait-for-attempt}.ts',
  'apps/server/src/handlers/attempt-handlers.ts',
];

export const featurePaths = {
  'file-item': [...coreGlobs],
  'claim-settle': [...coreGlobs, ...session],
  'report-cost': [
    ...coreGlobs,
    ...session,
    'apps/cli/src/commands/report-commands.ts',
    'apps/server/src/handlers/report-handlers.ts',

    // the sink that sends facts to pepys, which only this journey drains
    'packages/pepys/src/create-pepys-fact-sink.ts',
    'packages/pepys/src/sink/{is-outgoing-fact,pick-sink-answer,to-wire-fact}.ts',
  ],
  'plan-ordering': [
    ...coreGlobs,
    ...session,
    'apps/cli/src/commands/plan-commands.ts',
    'apps/server/src/handlers/plan-handlers.ts',
  ],
  'runner-pause': [...coreGlobs, ...tick, 'apps/cli/src/commands/runner-commands.ts'],
  'hold-notice': [
    ...coreGlobs,
    ...session,
    'apps/cli/src/commands/notices-commands.ts',
    'apps/server/src/handlers/notices-handlers.ts',
  ],
  'hold-recovery': [...coreGlobs, ...session],

  'owner-signoff': [
    ...coreGlobs,
    ...session,
    'apps/cli/src/commands/signoff-commands.ts',
    'apps/server/src/handlers/signoff-handlers.ts',
  ],

  // the public door, its OAuth server and the item handlers are all core
  'owner-mcp': [...coreGlobs],
} as const satisfies Record<string, readonly string[]>;

// The core globs, with a glob for each package folder that the core packages reach, from each
// `package.json` as this file loads.
async function readCoreGlobs(rootDir: string): Promise<string[]> {
  const packages = await readWorkspacePackages(rootDir);

  const folders = collectReachedFolders(corePaths.packages, packages);

  return [...folders.map((folder) => `${folder}/**`), ...corePaths.globs];
}

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

  // the verifier's report builders, which only its own tests call
  'adapters/verifier-wringer/src/test-utils/**',

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

  // the hook config, and the old shared baseline it replaced, which this change deletes
  '{lefthook.yml,.lefthook/**}',
  'audit-ignores.json',
  'socket.yml',
  'review.json',
  'renovate.json',

  // the skills, the verify skill's feature map among them
  '.agents/**',
  '.claude/**',
  '.github/**',
  'scripts/**',

  // 3. The files that Renovate (the root catalog, the lock file, the Bun pin) and release-please
  //    (each package's version, the manifest) change. A patch or minor bump merges on green CI, and
  //    a major bump or a new Bun version gets the owner's review, with the full test suite in CI.
  '**/package.json',
  'bun.lock',
  '.bun-version',
  '.release-please-manifest.json',
  'release-please-config.json',

  // 4. Code that no journey runs: the harness runs fakes in place of most adapters, and composes
  //    the server itself, so the server's own start, config, timers and rules loader never run.
  //    Their own tests, the server's start tests on the atc stand-in and the live proof cover them.
  'adapters/worker-atc/**',
  'adapters/caller-proof-imp/**',
  'adapters/notifier-atc/**',
  'adapters/forge-github/**',
  'adapters/review-noslop/**',
  'apps/server/src/{main,start-server,no-caller-proof,create-capacity-backoff}.ts',
  'apps/server/src/config/**',
  'apps/server/src/rules/{create-rules-holder,read-rules-checkout}.ts',
  'apps/server/src/tick/start-tick-loop.ts',
  'apps/server/src/outbox/start-outbox-sender.ts',
] as const;
