# Tech stack

boxxy runs on Bun and TypeScript, serves its API with oRPC on Elysia, and keeps its store in SQLite
through Kysely. The same agents, shared skills and checks build every zgeoff repo, such as atc and
pepys, so boxxy uses the toolchain those repos share, and a fix to a shared file reaches all of
them. This doc gives the reason for each choice and says what each repo setup file is for. Read it
before you add a dependency or change the repo's tooling.

[Decision 0015](../../decisions/0015-stack.md) records the choices and the alternatives they beat.
[Layout](./layout.md) covers the import pins that keep each library in one package.
[How boxxy ships](./release.md) covers publishing. The [overview](../overview.md#terms) defines the
shared terms.

## Main choices

- **Bun runs the TypeScript source as it is,** with no build step. A published package therefore
  ships its source, and only its type declarations need a build
  ([package manifests](#typescript-and-package-manifests)).
- **The store is one SQLite file** that only the server opens, through Kysely on `bun:sqlite`. A
  claim needs a write transaction that checks and takes its seats in one step, and `bun:sqlite`
  gives it ([the data](../overview.md#the-data)).
- **One oRPC v2 contract serves both the RPC API and the MCP tools,** because only oRPC v2 has the
  MCP integration ([the listeners](../interfaces/api-and-auth.md#the-listeners)). It runs on Elysia
  2, the HTTP server, as pepys does, and the catalog pins the exact version of each.
- **[zgeoff/tools](https://github.com/zgeoff/tools) holds the files every zgeoff repo shares,** such
  as CI workflows, git hooks, skills and check scripts, and its repo-sync workflow copies them in
  ([what repo-sync delivers](#what-repo-sync-delivers)).
- **The code splits into apps, modules, adapters, libs and deployed packages,** and turbo boundaries
  and the `zgeoff/import-zones` lint rule enforce the split ([layout](./layout.md)).

## Packages

The root `workspaces.catalog` is the one list of external versions, each pinned exactly. A package
writes `"catalog:"` for an external dependency and `"workspace:*"` for another `@boxxy/*` package.

| Area                  | Packages                                                                          | Why                                                                                                                                 |
| --------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Runtime               | Bun, at the `.bun-version`; `engines.node >=24`                                   | Bun runs the source with no build step; Node 24's npm does the publish                                                              |
| Compiler              | `tsrs`                                                                            | a Rust port of the TypeScript 7 compiler; it typechecks and emits declarations                                                      |
| TypeScript            | `typescript` 7                                                                    | the optional peer that Elysia and msw resolve                                                                                       |
| Strict config         | `@tsconfig/strictest`                                                             | the strictest shared base                                                                                                           |
| Lint                  | `oxlint`, `@zgeoff/oxlint-config`, `@maschwenk/tsrslint`                          | the shared rules, the import pins among them; tsrslint runs the type-aware rules on `tsrs`                                          |
| Format                | `oxfmt`, `@zgeoff/oxfmt-config`, `@zgeoff/format-codemod`                         | the shared format; the codemod sets the blank lines between statements                                                              |
| Package boundaries    | `turbo`                                                                           | `turbo boundaries` fails a dependency between the wrong package kinds                                                               |
| Typed API             | `@orpc/*`, `@modelcontextprotocol/server`                                         | one contract serves the API and the MCP tools, and types the CLI's calls                                                            |
| atc client            | `@modelcontextprotocol/client`, at the server package's version                   | the [atc gateway](../work/sessions.md#the-atc-worker) serves its tools as MCP                                                       |
| HTTP server           | `elysia`, with its peers `typebox`, `exact-mirror` and `openapi-types`            | the peers are pinned in the catalog                                                                                                 |
| Database              | `kysely` on `bun:sqlite` through `@zgeoff/kysely-bun-sqlite`, Kysely's `Migrator` | one local file, the write transaction a claim needs, and migrations shipped in the package                                          |
| Validation            | `zod` 4                                                                           | every schema at a boundary                                                                                                          |
| Rules file            | `yaml`                                                                            | the owner writes the rules file in YAML                                                                                             |
| Launch prompts        | `liquidjs`, in the prompt-template lib only                                       | a recipe's [prompt](../work/pipeline.md#the-launch-prompt) is a Liquid template, and one lib sets the strict modes and allowed tags |
| CLI                   | `node:util` `parseArgs`                                                           | a table of commands needs only flags and positional arguments                                                                       |
| Control flow          | `ts-pattern`, `tiny-invariant`                                                    | exhaustive branches on unions, and guards for states only a bug reaches                                                             |
| State machines        | `xstate` 6, for the attempt machine only                                          | the attempt state table as data                                                                                                     |
| Tests                 | `bun test` through `@zgeoff/rig`, `@zgeoff/bun-test-extended`, `@faker-js/faker`  | rig runs each kind of test in its own lane with its own limits; the shared matchers                                                 |
| GitHub                | `@octokit/auth-app`, `@octokit/request`; `msw` and `@msw/data` in tests           | sign the App's JWT and mint its token; fake the REST API in the adapter's tests                                                     |
| Git hooks and commits | `lefthook`, gitleaks, `@commitlint/cli`, `@zgeoff/commitlint-config`              | fix staged files, scan for secrets, and enforce Conventional Commits, which release-please reads                                    |
| Repo checks           | `@zgeoff/chex`, `@zgeoff/diet`, `knip`, `@zgeoff/skill-gate`                      | the test layout and docs checks; dead code; the skills an agent loads before an edit                                                |

A function returns an expected failure as one variant of a union type, so boxxy needs no result
library. The server writes its logs as JSON lines to stderr, with no log library. boxxy has no
OpenTelemetry SDK either: each agent exports its own telemetry, atc stamps every agent it starts
with its session ID, and pepys joins that telemetry to attempts by the session ID
([the join keys](../interfaces/facts-and-pepys.md#the-join-keys)).

## Repo setup files

| File                                               | What it does                                                                                                                                                                                         |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.bun-version`                                     | the Bun version CI and `packageManager` use                                                                                                                                                          |
| `bunfig.toml`                                      | Bun's install and test settings                                                                                                                                                                      |
| `tsconfig.base.json`, `tsconfig.json`              | the shared compiler options, and the root files' typecheck                                                                                                                                           |
| `turbo.json`                                       | the boundaries tags, and what each may depend on                                                                                                                                                     |
| `.oxlintrc.json`                                   | the lint rules, the import pins among them                                                                                                                                                           |
| `oxfmt.config.ts`, `.formatignore`                 | the formatter config, and the files the codemod skips                                                                                                                                                |
| `lefthook.yml`                                     | the git hooks                                                                                                                                                                                        |
| `rig.config.ts`                                    | empty, so rig runs its built-in lanes; a lane that differs goes here                                                                                                                                 |
| `knip.json`                                        | the dead-code check's entries per workspace                                                                                                                                                          |
| `audit-ignores.json`                               | each ignored advisory, with its package, reason and expiry                                                                                                                                           |
| `review.json`                                      | the config of noslop, the review tool; it lists the synced files so noslop skips them                                                                                                                |
| `release-please-config.json` and its manifest      | one release component per package ([one version](./release.md#one-version-for-every-package))                                                                                                        |
| `.claude/settings.json`, `.claude/skill-gate.json` | wire the skill-gate hook, and map file globs to the skills an agent loads before an edit                                                                                                             |
| `.github/workflows/`                               | `main.yml` checks `main` and publishes, `npm-packages.yml` rehearses the publish, `repo-sync.yml` pulls the shared files, and `verify.yml` runs the [verify gate](./verify-journeys.md#the-ci-check) |

- **`bunfig.toml`** installs with an isolated linker and saves exact versions. Its
  `minimumReleaseAge` refuses a version until it has been on npm for a set time, as a guard against
  a hijacked release. Renovate bumps a first-party package, such as `@zgeoff/rig` or `@pepys/kit`,
  as soon as it publishes, so `minimumReleaseAgeExcludes` lists every first-party package boxxy
  installs.
- **`lefthook.yml`** fixes the staged files and runs gitleaks before a commit, and commitlint on the
  message. Before a push it runs `prose` and `boundaries`, then the pre-push baseline that
  `@zgeoff/chex` ships, which `lefthook.yml` extends from `node_modules`. The baseline runs each job
  under the memory cap of `@zgeoff/diet`.

CI runs the shared checks in the `pr / checks` job of `pr.yml`, which repo-sync delivers. The
`BUN_CHECK_SCRIPTS` repo variable, set in GitHub, lists the root scripts it runs:
`audit deadcode format:check lint:full typecheck boundaries check:test-layout prose test`. The job
also runs each docs check that `check:docs` lists, as a separate step. The type-aware lint and the
dead-code check run only in CI, so an agent on a host with little memory never runs them; an agent
runs `typecheck`, `lint` and `test` locally.

### What repo-sync delivers

repo-sync delivers the entries every repo takes, plus the opt-in entries boxxy's `repo-sync.yml`
lists in `include`:

- `.github/workflows/pr.yml`, whose `pr / checks` job the repo's GitHub ruleset requires;
- `.github/workflows/audit-fix.yml` and `.github/workflows/repo-sync-guard.yml`;
- the shared skills, and `scripts/run-knip.sh` for the dead-code check;
- the PR template, the issue templates, `.editorconfig` and `socket.yml`.

`repo-sync.yml` lists `memory-cap` in `skip`, because diet replaces that entry, and the chex
baseline comes from the `@zgeoff/chex` package. repo-sync overwrites a synced file on the next sync,
so change it in zgeoff/tools. Its
[downstream repo setup runbook](https://github.com/zgeoff/tools/blob/main/docs/runbooks/downstream-repo-setup.md)
gives the one-time steps for a new repo.

boxxy keeps two skill-gate files that repo-sync must leave alone. The hook
`.claude/hooks/skill-gate/skill-gate.ts`, which `.claude/settings.json` runs before each edit and
around each shell command, has no entry in the zgeoff/tools manifest, and repo-sync deletes such a
file unless the repo lists it in `skip`
([retired files](https://github.com/zgeoff/tools/blob/main/docs/architecture/repo-sync.md#retired-files));
boxxy's `skip` lists `hook-skill-gate`. The `@zgeoff/skill-gate` README gives the steps to replace
the hook with `@zgeoff/agent-hooks`. `.claude/skill-gate.json` maps boxxy's own file globs to
skills, and the `skill-gate-rules` entry of zgeoff/tools lists boxxy in its `except`, so repo-sync
never overwrites it.

## TypeScript and package manifests

boxxy uses no project references. Each package's `tsconfig.json` extends one root
`tsconfig.base.json`, which extends `@tsconfig/strictest`, emits nothing and resolves imports the
way a bundler does. A package's `typecheck` runs `tsrs --noEmit`, and its `build` writes only the
declarations of `src`, without the tests, into `dist`.

Every package's `package.json` is written for publishing. Its `exports` point `types` at `dist` and
`default` at the TypeScript source. A workspace checkout has no `dist` until a build runs, so the
typechecker falls through to `default` and a sibling package typechecks against the source; a
published package carries the built `dist`, so a consumer reads the declarations. Only Bun can run a
published package, because Node refuses to strip types from a file under `node_modules`, and
`engines.node` names the Node whose bundled npm publishes it. Each package also ships its own
README, license and the changelog release-please writes, and sets `description`, `homepage` and
`bugs`.
