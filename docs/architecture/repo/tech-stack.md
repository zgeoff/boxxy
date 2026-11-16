# Tech stack

boxxy runs on Bun and TypeScript, serves its API with oRPC on Elysia, and keeps its store in SQLite
through Kysely. It shares one toolchain with the other repos its agents build, so the same agents,
shared skills and checks work on all of them. Every package publishes to npm through release-please
and npm trusted publishing. This doc gives each choice with its reason, the repo setup files, and
how a package is built and released.

[The overview](../overview.md#terms) defines the terms this doc uses.
[Decision 0015: stack](../../decisions/0015-stack.md) records the choices and the alternatives they
beat. [Layout](./layout.md) covers the package kinds and the import pins that keep each library in
one package. [How boxxy ships](./release.md) covers the packages a deployment installs and the
version they share.

## Main choices

- **Elysia 2.0 release candidate.** The server serves the oRPC API and its MCP endpoints through
  Elysia 2.0 rc. pepys runs oRPC on Elysia 2.0 rc as well, so the pairing is proven.
- **oRPC v2 beta.** The server serves one contract both as its RPC API and as MCP tools, and only
  oRPC v2 has the MCP integration ([API and auth](../interfaces/api-and-auth.md#the-doors)).
- **Shared files through repo-sync.** [zgeoff/tools](https://github.com/zgeoff/tools) holds the
  files every zgeoff repo shares: CI workflows, git hooks, skills and check scripts. Its repo-sync
  workflow copies them into each repo, so a fix to a shared file reaches every repo. The copies
  include the pre-push baseline, which runs chex, the shared repo checks.
- **The package split.** boxxy splits its code into `apps/`, `modules/`, `adapters/` and `libs/`,
  plus `packages/` for a package that another repo's deployment installs, such as the pepys plug-in.
  turbo boundaries and the `zgeoff/import-zones` lint rule enforce the split
  ([layout](./layout.md)).

## Packages

Every external version is pinned exactly, once, in the root `workspaces.catalog`, which is the one
list of versions. A package writes `"catalog:"` for an external dependency and `"workspace:*"` for
another `@boxxy/*` package.

| Area                    | Packages                                                                                      | Why                                                                           |
| ----------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Runtime                 | Bun, at the version `.bun-version` gives; `engines.node >=24`                                 | Bun runs the source with no build step; Node 24's npm does the publish        |
| Compiler                | `tsrs`                                                                                        | a Rust port of the TypeScript 7 compiler; it typechecks and emits types       |
| TypeScript              | `typescript` 7                                                                                | the optional peer that Elysia and msw resolve                                 |
| Strict config           | `@tsconfig/strictest`                                                                         | the strictest shared base                                                     |
| Lint                    | `oxlint`, `@zgeoff/oxlint-config`                                                             | the shared rules, including the import zones and the folder rules             |
| Type-aware lint         | `@maschwenk/tsrslint`                                                                         | runs oxlint's type-aware rules on `tsrs`                                      |
| Format                  | `oxfmt`, `@zgeoff/oxfmt-config`, `@zgeoff/format-codemod`                                     | the shared formatter config and the codemods it runs                          |
| Package boundaries      | `turbo`                                                                                       | `turbo boundaries` fails a dependency between the wrong package kinds         |
| Typed API               | `@orpc/contract`, `@orpc/server`, `@orpc/client`, `@orpc/mcp`, `@modelcontextprotocol/server` | one contract serves the API and the MCP tools, and types the CLI's calls      |
| atc client              | `@modelcontextprotocol/client`, at the version of `@modelcontextprotocol/server`              | the [atc gateway](../work/sessions.md#the-atc-worker) serves its tools as MCP |
| HTTP server             | `elysia`, with `typebox`, `exact-mirror` and `openapi-types`                                  | Elysia's peers, pinned in the catalog                                         |
| Database                | `kysely` on `bun:sqlite` through `@zgeoff/kysely-bun-sqlite`                                  | one local file that only the server opens, and a claim's compare-and-set      |
| Migrations              | Kysely's `Migrator` with an in-code migration provider                                        | migrations ship inside the package                                            |
| Validation              | `zod` 4                                                                                       | every schema at a boundary                                                    |
| Rules files             | `yaml`                                                                                        | the rules file is YAML                                                        |
| Launch prompt templates | `liquidjs`, in `@boxxy/prompt-template` only                                                  | one lib sets the strict modes and the allowed tags and filters                |
| CLI                     | `node:util` `parseArgs`, with the command table of `apps/cli`                                 | a table of commands needs only flags and positional arguments                 |
| Control flow            | `ts-pattern`, `tiny-invariant`                                                                | exhaustive branches on unions, and guards for states only a bug reaches       |
| State machines          | `xstate` 6 beta, for the attempt machine in `@boxxy/dispatch` only                            | the attempt state table as data                                               |
| Tests                   | `bun test` through `@zgeoff/rig`, `@zgeoff/bun-test-extended`, `@faker-js/faker`              | the shared test lanes and matchers                                            |
| GitHub App auth         | `@octokit/auth-app` and `@octokit/request`, in `adapters/forge-github` only                   | sign the App's JWT and mint its installation token                            |
| HTTP mocks              | `msw` with `@mswjs/interceptors`, and `@msw/data` collections                                 | the GitHub REST API in `adapters/forge-github` tests                          |
| Git hooks               | `lefthook`, gitleaks                                                                          | fix staged files and scan for secrets before a commit                         |
| Commits                 | `@commitlint/cli`, `@zgeoff/commitlint-config`                                                | Conventional Commits, which release-please reads                              |
| Repo checks             | `@zgeoff/chex`                                                                                | the test layout and docs checks                                               |
| Dead code               | `knip`                                                                                        | unused files, exports and dependencies                                        |
| Skill gate              | `@zgeoff/skill-gate`                                                                          | an agent loads the right skills before an edit                                |

- A function returns an expected failure as one variant of a union type. boxxy uses no result
  library.
- The server writes its logs as JSON lines to stderr, with no log library.
- boxxy has no OpenTelemetry SDK. Each agent exports its own telemetry, and atc stamps every agent
  it starts with its session ID. pepys joins that telemetry to [attempts](../work/attempts.md) by
  the session ID ([the join keys](../interfaces/facts-and-pepys.md#the-join-keys)).

## Repo setup files

| File                                                          | What it does                                                                                                   |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `package.json` (root)                                         | the workspaces, the catalog and the root scripts                                                               |
| `.bun-version`                                                | the Bun version CI and `packageManager` use                                                                    |
| `bunfig.toml`                                                 | Bun's install and test settings; the list below gives the ones that matter                                     |
| `tsconfig.base.json`, `tsconfig.json`                         | the shared compiler options, and the root files' typecheck                                                     |
| `turbo.json`                                                  | the boundaries tags and what each may depend on                                                                |
| `.oxlintrc.json`                                              | extends `@zgeoff/oxlint-config`; holds the `zgeoff/import-zones` pins                                          |
| `oxfmt.config.ts`, `.formatignore`                            | the formatter config, and the files `format-codemod` skips                                                     |
| `lefthook.yml`                                                | the git hooks; the list below gives what each runs                                                             |
| `commitlint.config.js`                                        | extends `@zgeoff/commitlint-config`                                                                            |
| `rig.config.ts`                                               | an empty `defineRig({})`, so the tests run in `rig`'s built-in lanes; a lane that differs from those goes here |
| `knip.json`                                                   | the dead-code check's entries per workspace                                                                    |
| `audit-ignores.json`                                          | each ignored advisory with its package, reason and expiry                                                      |
| `renovate.json`                                               | extends the `github>zgeoff/tools` preset                                                                       |
| `review.json`                                                 | the config of noslop, the review tool; it lists the synced files so noslop skips them                          |
| `release-please-config.json`, `.release-please-manifest.json` | one release component per published package                                                                    |
| `.gitleaks.toml`                                              | the secret scan's allow list                                                                                   |
| `AGENTS.md`, `CLAUDE.md`                                      | agent rules; `CLAUDE.md` is one line that points at `AGENTS.md`                                                |
| `.claude/settings.json`, `.claude/skill-gate.json`            | wire the skill-gate hook, and map file globs to the skills an agent loads before an edit                       |
| `LICENSE`                                                     | MIT, "the boxxy authors"                                                                                       |
| `.github/workflows/main.yml`                                  | the checks on each push to `main`, the release, and the publish                                                |
| `.github/workflows/npm-packages.yml`                          | a rehearsal of the publish and the CLI build                                                                   |
| `.github/workflows/repo-sync.yml`                             | calls the repo-sync workflow of zgeoff/tools, pinned to a green tools commit                                   |
| `.github/workflows/verify.yml`                                | the `verify / gate` check, which [verify journeys](./verify-journeys.md#the-ci-check) owns                     |
| `scripts/publish/`, `scripts/release/`, `scripts/ci/`         | the scripts the release workflows and the verify gate run                                                      |

- `bunfig.toml` installs with an isolated linker and saves exact versions. Its `minimumReleaseAge`
  refuses a version until it has been on npm for a set time, as a guard against a hijacked release.
  Renovate bumps a first-party package, such as `@zgeoff/rig` or `@pepys/kit`, as soon as it
  publishes, so `minimumReleaseAgeExcludes` lists every first-party package boxxy installs.
- `lefthook.yml` fixes the staged files and runs gitleaks before a commit, and runs commitlint on
  the commit message. Before a push it runs `prose` and `boundaries`, then the shared pre-push
  baseline that repo-sync delivers.

The `BUN_CHECK_SCRIPTS` repo variable gives CI its list of root scripts:
`audit deadcode format:check lint:full typecheck boundaries check:test-layout prose test`.
`boundaries` runs `turbo boundaries`, and `check:test-layout` runs `chex test-layout`, which fails a
test or a test helper outside the [test layout](./layout.md#inside-a-package). `prose` runs the
prose check on `AGENTS.md`. The shared checks job also runs each docs check that the `check:docs`
script lists, each as a separate step. The type-aware lint (`lint:full`) and the dead-code check run
in CI only, so an agent on a host with little memory never runs them. An agent runs `typecheck`,
`lint` and `test` locally.

### What repo-sync delivers

boxxy's `repo-sync.yml` lists the opt-in entries it takes in `include`: `workflow-bun-pr`,
`workflow-audit-fix`, `pre-push-baseline`, `skill-testing`, `skill-code-style`,
`skill-docs-writing`, `skill-skill-writing`, `skill-ci-design` and `knip-runner`. With the entries
every repo takes, repo-sync delivers:

- `.github/workflows/pr.yml`, which runs the shared Bun checks; the repo's GitHub ruleset requires
  its `pr / checks` job;
- `.github/workflows/audit-fix.yml` and `.github/workflows/repo-sync-guard.yml`;
- `.lefthook/pre-push-baseline.yml` and the scripts it calls, each run under a memory cap;
- the shared skills, and `scripts/run-knip.sh` for the dead-code check;
- the PR template, the issue templates, `.editorconfig` and `socket.yml`.

boxxy keeps two skill-gate files of its own. zgeoff/tools no longer ships the skill-gate hook,
`.claude/hooks/skill-gate/skill-gate.ts`, but `.claude/settings.json` still runs it. repo-sync
deletes a file whose entry left the manifest, unless the repo lists that entry in `skip`
([retired files](https://github.com/zgeoff/tools/blob/main/docs/architecture/repo-sync.md#retired-files)).
boxxy's `skip` therefore lists `hook-skill-gate`, and the hook stays. boxxy also writes its own
`.claude/skill-gate.json`, so the `skill-gate-rules` entry of zgeoff/tools lists boxxy in its
`except`, and repo-sync leaves that file alone.

repo-sync overwrites a synced file on the next sync, so change it in zgeoff/tools. The
[downstream repo setup runbook](https://github.com/zgeoff/tools/blob/main/docs/runbooks/downstream-repo-setup.md)
of zgeoff/tools gives the one-time steps for a new repo.

## Release

```mermaid
flowchart LR
  land[releasable commit on main] --> pr[release PR]
  pr -->|merged by hand| tag[main.yml run of the merge tags each release]
  tag -->|dispatches| publish[publish run at the tag]
  publish --> npm[npm publish with OIDC]
  publish --> assets[CLI release assets]
```

boxxy releases through release-please and publishes through npm trusted publishing. One workflow,
`main.yml`, publishes. `npm-packages.yml` packs each package, dry-runs its publish and builds the
CLI's release assets on each push to `main`, and on a pull request that changes a file a package or
the publish reads. A pull request that breaks the publish therefore fails before it merges.

1. A releasable commit lands on `main`. The release job of `main.yml` calls the release-please
   workflow of zgeoff/tools, which opens or updates one release PR with the version bumps and
   changelogs.
2. A maintainer merges the release PR by hand. The `main.yml` run of that merge, the push run, tags
   each release as `@boxxy/<package>@<version>`.
3. The push run dispatches a publish run at the tag, so npm provenance records the tagged commit.
4. The publish run waits for the tagged commit's checks, then runs `npm publish` from Node 24's
   bundled npm with the job's OIDC token. The repo holds no npm token. `bun publish` has no OIDC
   support, so npm publishes.
5. When the release holds `@boxxy/cli`, a second job of the publish run compiles the CLI and
   attaches the binary, the hook plug-in archive and their checksums to the CLI's GitHub release.
   That job runs alone with `contents: write`, so that permission never shares a job with the OIDC
   token.

All publish runs share one queue, and each run holds its place there through its checks and its
publish. Releases therefore publish in the order the push runs dispatched them. A publish run never
cancels, so a release never stops halfway. A version below the package's `latest` dist-tag publishes
under the `backport` dist-tag, so `latest` stays on the newest version.

npm adds a trusted publisher only to a name that is on the registry, so a new package name needs one
publish by hand first:
[the first publish of a new name](./release.md#the-first-publish-of-a-new-name) gives it.
[How boxxy ships](./release.md) gives the packages and the one version they share, and the
[releasing runbook](../../runbooks/releasing.md) gives the steps.

## tsconfig

boxxy uses no project references. One root `tsconfig.base.json` extends `@tsconfig/strictest`, and
each package's `tsconfig.json` extends it. Bun runs the `.ts` source as it is, so the base sets
`noEmit`, allows `.ts` extensions in imports, and resolves modules the way a bundler does
(`module: Preserve`, `moduleResolution: bundler`). It also loads the types of Bun and of
`@zgeoff/bun-test-extended`.

A package's `tsconfig.json` includes `src`, plus its `e2e` or `bench` folder where it has one, and
its `typecheck` script runs `tsrs --noEmit`. Its `tsconfig.build.json` emits declarations only, from
`src` to `dist`, and leaves out the tests.

## Package manifests

Every package's `package.json` is written for publishing. Inside the workspace Bun runs the source;
the published files add the emitted declarations. An invented example:

```json
{
  "name": "@boxxy/example",
  "version": "0.1.0",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/zgeoff/boxxy.git",
    "directory": "libs/example"
  },
  "files": ["src", "!src/**/*.test.ts", "dist"],
  "type": "module",
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./src/index.ts" } },
  "publishConfig": { "access": "public" },
  "scripts": {
    "build": "rm -rf dist && tsrs -p tsconfig.build.json",
    "typecheck": "tsrs --noEmit"
  },
  "engines": { "bun": ">=1.3", "node": ">=24" }
}
```

Each published package also carries its own `README.md`, `LICENSE` and the `CHANGELOG.md` that
release-please writes. It also sets `description`, `homepage` and `bugs`.

## Every package publishes

Every package under `apps/`, `modules/`, `adapters/`, `libs/` and `packages/` publishes as
`@boxxy/<folder>`. A published package ships its source with no bundler, so each `@boxxy/*` package
it imports stays a dependency that npm must install. npm can't install a package that was never
published, so boxxy keeps no private package. The oRPC contract lives in `libs/contract`
(`@boxxy/contract`), so the server and the CLI share it as a published lib.
