# Tech stack

boxxy uses the stack its sibling repos run: atc, nixie, noslop, pepys and wringer. Where they
disagree, boxxy copies the newest choice, and it takes wringer as the template for a repo that
publishes packages. Each row below gives the repo it comes from. Three choices are the owner's own
calls, listed first.

The decision behind this doc is [0015: stack](../../decisions/0015-stack.md). The workspace folders
are in [the layout](./layout.md).

## The owner's calls

- **Elysia 2.0 rc.** boxxy serves its oRPC API on Elysia `2.0.0-rc.0`, as pepys does with oRPC
  `1.16.1`. pepys's spike shows oRPC `1.16.1` runs on it. The other repos stay on Elysia `1.4.30`.
- **Shared files through repo-sync.** boxxy takes its shared files from zgeoff/tools through the
  repo-sync workflow, like every other repo. repo-sync delivers the chex checks with them.
- **The four-folder split.** boxxy uses noslop's and nixie's `apps/ modules/ adapters/ libs/` split,
  enforced by turbo boundaries and `zgeoff/import-zones`, with wringer's package conventions inside
  each package.

## Versions

Every external version is pinned exactly, once, in the root `workspaces.catalog`. Packages write
`"catalog:"` for an external dependency and `"workspace:*"` for another `@boxxy/*` package.

| Area               | Package and version                                                                                                   | Copied from                             |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Runtime            | Bun `1.4.4`; `engines.node >=24`, for npm publish                                                                     | pepys, nixie, atc, noslop               |
| Compiler           | `typescript` `7.0.2`, `tsrs` `0.18.0-ts7.1.0-dev.20260929`                                                            | wringer, nixie, atc, noslop             |
| Strict config      | `@tsconfig/strictest` `2.0.8`                                                                                         | wringer                                 |
| Lint               | `oxlint` `1.90.0`, `@zgeoff/oxlint-config` `0.7.7`                                                                    | atc; zgeoff/tools                       |
| Type-aware lint    | `@maschwenk/tsrslint` `0.1.6`                                                                                         | wringer, nixie, atc, noslop             |
| Format             | `oxfmt` `0.75.0`, `@zgeoff/oxfmt-config` `0.1.0`, `@zgeoff/format-codemod` `0.3.5`                                    | atc (oxfmt); zgeoff/tools (the configs) |
| Package boundaries | `turbo` `2.11.10`                                                                                                     | noslop, nixie                           |
| Typed API          | `@orpc/contract`, `@orpc/server`, `@orpc/client` `1.16.1`                                                             | nixie, atc, pepys                       |
| HTTP server        | `elysia` `2.0.0-rc.0`, with `typebox` `1.4.3`, `exact-mirror` `1.2.6` and `openapi-types` `12.1.3` as pepys pins them | pepys                                   |
| Database           | `kysely` `0.29.7` on `bun:sqlite` through `@zgeoff/kysely-bun-sqlite` `0.3.0`                                         | nixie, atc                              |
| Migrations         | Kysely's `Migrator` with an in-code migration provider                                                                | atc                                     |
| Validation         | `zod` `4.6.7`                                                                                                         | all five                                |
| CLI                | `gunshi` `1.0.0-rc.1`                                                                                                 | nixie, atc, noslop                      |
| Logging            | `@logtape/logtape` `2.4.2`                                                                                            | nixie, atc, noslop                      |
| Control flow       | `ts-pattern` `5.9.2`, `tiny-invariant` `1.3.3`, `type-fest` `5.10.0`, `@zgeoff/std` `0.4.0`                           | atc, pepys                              |
| State machines     | `xstate` `5.33.3`, for in-memory state only                                                                           | nixie, atc                              |
| Tests              | `bun test --randomize`, `@zgeoff/bun-test-extended` `0.2.3`, `@faker-js/faker` `10.6.0`                               | nixie                                   |
| HTTP mocks         | `msw` `2.15.0`, `@msw/data` `1.1.8`                                                                                   | nixie, noslop                           |
| Git hooks          | `lefthook` `2.2.2`, gitleaks                                                                                          | all five                                |
| Commits            | `@commitlint/cli` `21.2.4`, `@zgeoff/commitlint-config` `0.1.0`                                                       | wringer, pepys, nixie                   |
| Dead code          | `knip` `6.43.0`                                                                                                       | the newest of the five                  |
| Skill gate         | `@zgeoff/skill-gate` `0.2.15`                                                                                         | the newest of the five                  |

- msw stays on 2, because msw 3 doesn't intercept `fetch` under Bun.
- Expected outcomes are values of a union type, branched with `ts-pattern`'s `match().exhaustive()`.
  `tiny-invariant` guards states that only a bug can reach. boxxy uses no result library.
- boxxy has no OpenTelemetry SDK. Agents send their own telemetry, which atc's agent config switches
  on, and boxxy joins it to attempts by the agent session id (see
  [measurement](./measurement.md#spend-capture)).

## Repo setup files

| File                                                                              | What it does                                                                                                      | Copied from    |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------- |
| `package.json` (root)                                                             | the workspace list (`apps/*`, `modules/*`, `adapters/*`, `libs/*`, `test-utils`, `e2e`), the catalog, tooling     | wringer        |
| `.bun-version`                                                                    | the Bun version CI and `packageManager` use                                                                       | wringer        |
| `bunfig.toml`                                                                     | isolated linker, exact saves, a 7-day minimum release age with first-party excludes, the test preload             | wringer        |
| `tsconfig.base.json`, `tsconfig.json`                                             | the shared compiler options, and the root files' typecheck                                                        | wringer        |
| `turbo.json`                                                                      | the boundaries tags and what each may import                                                                      | noslop         |
| `.oxlintrc.json`                                                                  | extends `@zgeoff/oxlint-config`; holds the `zgeoff/import-zones` pins                                             | wringer, nixie |
| `oxfmt.config.ts`, `.formatignore`                                                | the formatter config, which spreads `@zgeoff/oxfmt-config`, and the files `format-codemod` skips                  | wringer        |
| `lefthook.yml`                                                                    | pre-commit fixes staged files and runs gitleaks; commit-msg runs commitlint; extends the synced pre-push baseline | wringer        |
| `commitlint.config.js`                                                            | extends `@zgeoff/commitlint-config`                                                                               | wringer        |
| `knip.json`                                                                       | the dead-code check's entries per workspace                                                                       | wringer        |
| `audit-ignores.json`                                                              | each ignored advisory with its package, reason and expiry                                                         | wringer        |
| `renovate.json`                                                                   | extends the `github>zgeoff/tools` preset                                                                          | wringer, pepys |
| `review.json`                                                                     | noslop's config; lists the synced paths so noslop skips them                                                      | wringer        |
| `release-please-config.json`, `.release-please-manifest.json`                     | one release component per published package                                                                       | wringer        |
| `.gitleaks.toml`                                                                  | the secret scan's allow list                                                                                      | wringer        |
| `AGENTS.md`, `CLAUDE.md`                                                          | agent rules; `CLAUDE.md` is one line that points at `AGENTS.md`                                                   | wringer        |
| `.claude/settings.json`, `.claude/skill-gate.json`                                | wire the skill-gate hook, and map file globs to the skills an agent loads before an edit                          | wringer        |
| `LICENSE`                                                                         | MIT, "the boxxy authors"                                                                                          | wringer        |
| `.github/workflows/main.yml`                                                      | checks on each push to `main`, then release-please, then a dispatched publish at the release tag                  | wringer        |
| `.github/workflows/npm-packages.yml`                                              | packs each published package and dry-runs its publish                                                             | wringer        |
| `.github/workflows/repo-sync.yml`                                                 | calls zgeoff/tools's repo-sync, pinned to the newest green tools commit                                           | zgeoff/tools   |
| `scripts/publish/`, `scripts/release/`, `scripts/ci/`, `scripts/first-publish.sh` | the publish dispatch, the package publish and the one-time first publish; `scripts/test-utils/` holds their stubs | wringer        |

The root `check` script runs audit, dead code, format check, type-aware lint, typecheck, prose and
tests, as wringer's does, and adds `boundaries` (`turbo boundaries`), as noslop's does. The
`BUN_CHECK_SCRIPTS` repo variable gives CI the same list:
`audit deadcode format:check lint:full typecheck boundaries prose test`. Change both together.
lefthook's pre-push runs `prose` and `boundaries`, then the synced baseline.

### What repo-sync delivers

boxxy's `repo-sync.yml` uses wringer's `include` list: `workflow-bun-pr`, `workflow-audit-fix`,
`pre-push-baseline`, `hook-skill-gate`, `skill-testing`, `skill-code-style`, `skill-docs-writing`,
`skill-skill-writing` and `skill-ci-design`. With the entries every repo takes, repo-sync delivers:

- `.github/workflows/pr.yml`, which runs the shared Bun checks; the ruleset requires `pr / checks`;
- `.github/workflows/audit-fix.yml` and `.github/workflows/repo-sync-guard.yml`;
- `.lefthook/pre-push-baseline.yml` and the scripts it calls, each run under a memory cap;
- the shared skills and the skill-gate hook. boxxy keeps its own `.claude/skill-gate.json`, so the
  `skill-gate-rules` entry of zgeoff/tools lists boxxy in its `except`;
- the PR template, the issue templates, `.editorconfig` and `socket.yml`.

A synced file is overwritten on the next sync, so change it in zgeoff/tools. zgeoff/tools's
downstream repo setup runbook gives the one-time steps for a new repo.

## Release

boxxy releases through release-please and publishes through npm trusted publishing, both as wringer
does. One workflow, `main.yml`, publishes. `npm-packages.yml` only rehearses the publish on a PR.

1. A releasable commit lands on `main`. The shared release-please job opens or updates one release
   PR with the version bumps and changelogs.
2. A maintainer merges the release PR by hand. The push run of that merge tags each release as
   `@boxxy/<package>@<version>`.
3. The push run dispatches a publish run at the tag, so npm provenance records the tagged commit.
4. The publish run waits for the tagged commit's checks, then runs `npm publish` from Node 24's
   bundled npm with the job's OIDC token. No npm token exists in the repo. `bun publish` has no OIDC
   support, so npm publishes.

Publish runs queue and never cancel, so a release never stops halfway. A package that is new to npm
gets one local publish through `scripts/first-publish.sh`, then a trusted publisher on npmjs.com
that names `main.yml`. The [releasing runbook](../../runbooks/releasing.md) gives the steps.

## tsconfig

boxxy uses no project references. One root `tsconfig.base.json` extends `@tsconfig/strictest`, and
each package's `tsconfig.json` extends it. The base:

```json
{
  "extends": "@tsconfig/strictest/tsconfig.json",
  "compilerOptions": {
    "target": "ESNext",
    "lib": ["ESNext"],
    "module": "Preserve",
    "moduleResolution": "bundler",
    "types": ["bun", "@zgeoff/bun-test-extended"],
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force"
  }
}
```

A package's `tsconfig.json` is
`{ "extends": "../../tsconfig.base.json", "include": ["src", "test-utils"] }`, and its `typecheck`
script runs `tsrs --noEmit`. Each package also has a `tsconfig.build.json` that emits declarations
only, from `src` to `dist`, and excludes `src/**/*.test.ts`.

## Package manifests

Every package uses the published shape. Inside the workspace Bun runs the source; the published
files add emitted declarations, as `@wringer/core` does:

```json
{
  "name": "@boxxy/cli",
  "version": "0.1.0",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/zgeoff/boxxy.git",
    "directory": "apps/cli"
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
release-please writes. It also sets `description`, `homepage` and `bugs`, as wringer's does.

## Every package publishes

Every package under `apps/`, `modules/`, `adapters/` and `libs/` publishes as `@boxxy/<folder>`, as
wringer publishes each of its packages. A published package ships source, so it can't depend on a
private one; publishing all of them keeps the CLI's dependencies installable without a bundler.
`test-utils/` and `e2e/` are private workspace packages, which only tests import, and never publish.
The oRPC contract lives in `libs/contract` (`@boxxy/contract`), as nixie keeps its contract.

## Open questions

- **The shared configs adopted nowhere yet.** `@zgeoff/oxfmt-config` and `@zgeoff/tsconfig` are new
  in zgeoff/tools. boxxy takes the oxfmt config, as the stack decision sets, and stays on
  `@tsconfig/strictest`, which all five repos run, until `@zgeoff/tsconfig` is proven downstream.
- **First-party scope.** The Renovate preset and chex's first-party scopes don't list `@boxxy/**`.
  They need it only when another repo depends on a `@boxxy/*` package.
