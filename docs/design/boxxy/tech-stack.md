# Tech stack

boxxy uses the stack its sibling repos run: atc, nixie, noslop, pepys and wringer. Where they
disagree, boxxy copies the newest choice, and it takes wringer as the template for a repo that
publishes packages. Each row below gives the repo it comes from. Three choices are the owner's own
calls, listed first.

The decision behind this doc is [0015: stack](../../decisions/0015-stack.md). The workspace folders
are in [the layout](./layout.md).

## The owner's calls

- **Elysia 2.0 rc.** boxxy serves its oRPC API on Elysia `2.0.0-rc.0`, as pepys does. The other
  repos stay on Elysia `1.4.30`.
- **oRPC v2 beta.** The API and its two MCP endpoints run on oRPC `2.0.0-beta.50`, pinned exactly,
  because v2 has the MCP integration ([API and auth](./v1-api-and-auth.md#the-three-doors)).
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
| Lint               | `oxlint` `1.90.0`, `@zgeoff/oxlint-config` `0.10.5`                                                                    | atc; zgeoff/tools                       |
| Type-aware lint    | `@maschwenk/tsrslint` `0.1.6`                                                                                         | wringer, nixie, atc, noslop             |
| Format             | `oxfmt` `0.75.0`, `@zgeoff/oxfmt-config` `0.1.0`, `@zgeoff/format-codemod` `0.3.5`                                    | atc (oxfmt); zgeoff/tools (the configs) |
| Package boundaries | `turbo` `2.11.10`                                                                                                     | noslop, nixie                           |
| Typed API          | `@orpc/contract`, `@orpc/server`, `@orpc/client`, `@orpc/mcp` `2.0.0-beta.50`, `@modelcontextprotocol/server` `2.4.0` | boxxy's own choice                      |
| atc client         | `@modelcontextprotocol/client` `2.4.0`, the MCP client of the server library's release                                | atc (its gateway serves MCP)            |
| HTTP server        | `elysia` `2.0.0-rc.0`, with `typebox` `1.4.3`, `exact-mirror` `1.2.6` and `openapi-types` `12.1.3` as pepys pins them | pepys                                   |
| Database           | `kysely` `0.29.8` on `bun:sqlite` through `@zgeoff/kysely-bun-sqlite` `0.3.2`                                         | nixie, atc                              |
| Migrations         | Kysely's `Migrator` with an in-code migration provider                                                                | atc                                     |
| Validation         | `zod` `4.6.7`                                                                                                         | all five                                |
| Rules files        | `yaml` `2.9.1`                                                                                                        | boxxy's own choice                      |
| CLI                | `node:util` `parseArgs`, with the command table of `apps/cli`                                                         | boxxy's own choice                      |
| Logging            | `@logtape/logtape` `2.4.2`                                                                                            | nixie, atc, noslop                      |
| Control flow       | `ts-pattern` `5.9.2`, `tiny-invariant` `1.3.3`, `type-fest` `5.10.0`, `@zgeoff/std` `0.4.3`                           | atc, pepys                              |
| State machines     | `xstate` `6.0.0-beta.2`, pinned exactly, for the attempt state table in `@boxxy/dispatch` only                        | boxxy's own choice                      |
| Tests              | `bun test` through `@zgeoff/rig` `0.2.3` (`rig unit`, `rig related`, `rig bench`), `@zgeoff/bun-test-extended` `0.2.3`, `@faker-js/faker` `10.6.0` | zgeoff/tools                            |
| HTTP mocks         | `msw` `2.15.0`, `@msw/data` `1.1.8`                                                                                   | nixie, noslop                           |
| Git hooks          | `lefthook` `2.2.2`, gitleaks                                                                                          | all five                                |
| Commits            | `@commitlint/cli` `21.2.4`, `@zgeoff/commitlint-config` `0.1.0`                                                       | wringer, pepys, nixie                   |
| Repo checks        | `@zgeoff/chex` `0.3.4`, for the test layout and docs checks                                                           | zgeoff/tools                            |
| Dead code          | `knip` `6.44.1`                                                                                                       | the newest of the five                  |
| Skill gate         | `@zgeoff/skill-gate` `0.2.27`                                                                                         | the newest of the five                  |

- msw stays on 2, because msw 3 doesn't intercept `fetch` under Bun.
- Expected outcomes are values of a union type, branched with `ts-pattern`'s `match().exhaustive()`.
  `tiny-invariant` guards states that only a bug can reach. boxxy uses no result library.
- boxxy has no OpenTelemetry SDK. Agents send their own telemetry, which atc's agent config
  switches on, and boxxy joins it to attempts by the agent session id (see
  [measurement](./measurement.md#spend-capture)).

## Repo setup files

| File                                                                              | What it does                                                                                                      | Copied from    |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------- |
| `package.json` (root)                                                             | the workspace list (`apps/*`, `modules/*`, `adapters/*`, `libs/*`, `packages/*`), the catalog, tooling                          | wringer        |
| `.bun-version`                                                                    | the Bun version CI and `packageManager` use                                                                       | wringer        |
| `bunfig.toml`                                                                     | isolated linker, exact saves, a 7-day minimum release age with first-party excludes, the test preload             | wringer        |
| `tsconfig.base.json`, `tsconfig.json`                                             | the shared compiler options, and the root files' typecheck                                                        | wringer        |
| `turbo.json`                                                                      | the boundaries tags and what each may import                                                                      | noslop         |
| `.oxlintrc.json`                                                                  | extends `@zgeoff/oxlint-config`; holds the `zgeoff/import-zones` pins                                             | wringer, nixie |
| `oxfmt.config.ts`, `.formatignore`                                                | the formatter config, which spreads `@zgeoff/oxfmt-config`, and the files `format-codemod` skips                  | wringer        |
| `lefthook.yml`                                                                    | pre-commit fixes staged files and runs gitleaks; commit-msg runs commitlint; extends the synced pre-push baseline | wringer        |
| `commitlint.config.js`                                                            | extends `@zgeoff/commitlint-config`                                                                               | wringer        |
| `rig.config.ts`                                                                   | the test lanes that `rig` runs: the built-in lanes, and `system` for the tests in `system-tests/e2e/`             | zgeoff/tools   |
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
| `scripts/publish/`, `scripts/release/`, `scripts/ci/` | the publish dispatch and the package publish; `scripts/test-utils/` holds their stubs | wringer        |

The `BUN_CHECK_SCRIPTS` repo variable gives CI its list of root scripts:
`audit deadcode format:check lint:full typecheck boundaries check:test-layout prose test test:system`.
The list is wringer's, with `boundaries` (`turbo boundaries`) added, as noslop's has,
`check:test-layout` (`chex test-layout`), which fails a test or a test helper outside the
[test layout](./layout.md#inside-a-package), and `test:system` (`rig system`), which runs the tests
of two apps together. `test` stays `rig unit`, because `rig init` resets it to that on each rig
update. No root script runs the whole list: the type-aware lint
(`lint:full`) and the dead-code check run in CI only, so an agent on a host with little memory
never runs them. An agent runs `typecheck`, `lint` and `test` locally. CI also runs each docs check
that the `check:docs` script names, and `prose` adds the prose check of `AGENTS.md`. lefthook's
pre-push runs `prose` and `boundaries`, then the synced baseline.

### What repo-sync delivers

boxxy's `repo-sync.yml` uses wringer's `include` list: `workflow-bun-pr`, `workflow-audit-fix`,
`pre-push-baseline`, `skill-testing`, `skill-code-style`, `skill-docs-writing`,
`skill-skill-writing`, `skill-ci-design` and `knip-runner`. Its `skip` holds `hook-skill-gate`, an
entry zgeoff/tools retired: repo-sync keeps a retired entry's files in a repo that skips it, so
the skill-gate hook stays until boxxy moves to the `hook-start` entry. With the entries every repo
takes, repo-sync delivers:

- `.github/workflows/pr.yml`, which runs the shared Bun checks; the ruleset requires `pr / checks`;
- `.github/workflows/audit-fix.yml` and `.github/workflows/repo-sync-guard.yml`;
- `.lefthook/pre-push-baseline.yml` and the scripts it calls, each run under a memory cap;
- the shared skills, the skill-gate hook, and `scripts/run-knip.sh` for the dead-code check. boxxy
  keeps its own `.claude/skill-gate.json`, so the `skill-gate-rules` entry of zgeoff/tools lists
  boxxy in its `except`;
- the PR template, the issue templates, `.editorconfig` and `socket.yml`.

A synced file is overwritten on the next sync, so change it in zgeoff/tools. zgeoff/tools's
downstream repo setup runbook gives the one-time steps for a new repo.

## Release

boxxy releases through release-please and publishes through npm trusted publishing, both as wringer
does. One workflow, `main.yml`, publishes. `npm-packages.yml` only rehearses the publish and the CLI build
on a PR.

1. A releasable commit lands on `main`. The shared release-please job opens or updates one release
   PR with the version bumps and changelogs.
2. A maintainer merges the release PR by hand. The push run of that merge tags each release as
   `@boxxy/<package>@<version>`.
3. The push run dispatches a publish run at the tag, so npm provenance records the tagged commit.
4. The publish run waits for the tagged commit's checks, then runs `npm publish` from Node 24's
   bundled npm with the job's OIDC token. No npm token exists in the repo. `bun publish` has no OIDC
   support, so npm publishes.
5. When the release holds `@boxxy/cli`, a second job of the publish run compiles the CLI and attaches
   the binary to the CLI's GitHub release. It holds `contents: write`, apart from the publish job's OIDC token.

Publish runs queue and never cancel, so a release never stops halfway. Each publish run waits in
one queue with its own checks, so releases publish in the order they were tagged. A version below
the package's `latest` dist-tag publishes under the `backport` dist-tag, so `latest` stays on the
newest version. A package that is new to npm
gets one local publish of a placeholder, then a trusted publisher on npmjs.com that names
`main.yml`. [How boxxy ships](./release.md) gives the packages, the one version they share and the
first publish, and the [releasing runbook](../../runbooks/releasing.md) gives the steps.

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
`{ "extends": "../../tsconfig.base.json", "include": ["src", "e2e"] }`, and its `typecheck`
script runs `tsrs --noEmit`. Each package also has a `tsconfig.build.json` that emits
declarations only, from `src` to `dist`, and excludes `src/**/*.test.ts`.

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

Every package under `apps/`, `modules/`, `adapters/`, `libs/` and `packages/` publishes as `@boxxy/<folder>`, as
wringer publishes each of its packages. A published package ships source, so it can't depend on a
private one; publishing all of them keeps the CLI's dependencies installable without a bundler.
The repo has no private package. The oRPC contract lives in `libs/contract`
(`@boxxy/contract`), as nixie keeps its contract.

## Open questions

- **The shared configs adopted nowhere yet.** `@zgeoff/oxfmt-config` and `@zgeoff/tsconfig` are new
  in zgeoff/tools. boxxy takes the oxfmt config, as the stack decision sets, and stays on
  `@tsconfig/strictest`, which all five repos run, until `@zgeoff/tsconfig` is proven downstream.
