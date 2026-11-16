# Layout

boxxy is one Bun workspace of packages, in five kinds: apps, modules, adapters, libs and deployed
packages. Modules hold the domain and do no I/O. A module that needs an outside system declares a
port, an interface for that system, and an adapter implements the port for one system. Apps build
the adapters and pass them to the modules. Libs hold the types, schemas and pure helpers that two or
more packages use, and do no I/O either. A deployed package, in `packages/`, is one that another
repo's deployment installs. In this doc, "package" alone means a package of any kind.

Lint enforces the split, through `turbo boundaries` and the `zgeoff/import-zones` rule that the
sections below describe.

[The overview](../overview.md#terms) defines the terms this doc uses.
[Decision 0016: layout](../../decisions/0016-layout.md) records why the repo is split this way.
[Tech stack](./tech-stack.md) covers the libraries, the repo setup files and how each package is
built and published. [The pipeline](../work/pipeline.md) covers phases and pools, and
[Attempts](../work/attempts.md) covers close-outs, settle and the attempt machine.

## Workspace

```text
boxxy/
├── apps/                  build the adapters and pass them to the modules
│   ├── cli/               @boxxy/cli: the boxxy command and the hooks
│   └── server/            @boxxy/server: the Elysia + oRPC API and the runner loop
├── modules/               the domain; no I/O, no adapter imports
│   ├── rules/             loads the rules file, registers its plug-ins, hashes the rules version
│   ├── planning/          orders the ready items by the pools and levers
│   ├── dispatch/          the claim, the lease and the attempt machine
│   ├── closeout/          the phase kinds: each phase's input, close-out parser and settle rule
│   └── train/             the merge rule: what a merge job does on each read of its pull request
├── adapters/              one package per outside system, named <port>-<system>
│   ├── store-sqlite/      the store and its migrations, on bun:sqlite and Kysely
│   ├── auth-oauth/        the public listener's OAuth server and its auth database
│   ├── worker-atc/        starts and reads attempt sessions through atc
│   ├── notifier-atc/      sends a hold notice as an atc message
│   ├── forge-github/      PR and commit links, the PR body, checks and the merge
│   ├── review-noslop/     checks and posts a review session's noslop result; the ReviewGate port
│   ├── verifier-wringer/  reads a pull request's verify check and report; the Verifier port
│   └── caller-proof-imp/  proves a session's caller from the imp broker's identity token
├── libs/                  shared types, schemas and pure helpers; no I/O
│   ├── model/             every type 2+ packages share, the fact catalog, the ports
│   ├── contract/          the oRPC contract the server serves and the CLI calls
│   ├── content-hash/      the ContentHash type and its hashes
│   └── prompt-template/   the launch prompt's placeholders, load check and render
├── packages/              deployed packages, which another repo's deployment installs
│   └── pepys/             @boxxy/pepys: the pepys plug-in, the fact sink and the pepys reader
├── docs/                  architecture/, decisions/, design/ and runbooks/
└── scripts/               repo tooling; may do I/O
```

Each outside system has a doc of its own. [Agent sessions](../work/sessions.md#the-atc-worker)
covers the atc worker and the caller proof, [GitHub](../interfaces/github.md#the-github-adapter) the
forge, [the review gate](../../design/boxxy/review-and-merge.md#the-review-gate) noslop, the review
tool, [Verify journeys](./verify-journeys.md) wringer and its verify report, and
[Facts and pepys](../interfaces/facts-and-pepys.md) the fact sink and `@boxxy/pepys`.

Add a package in the same PR as the first code that needs it. Name its folder for its package name
under `@boxxy/`, so `modules/planning` is `@boxxy/planning`.

Put a type that two or more packages share in `@boxxy/model`, in `libs/model`. The modules, the
adapters and `@boxxy/contract` all import it, so two modules that share a type both import the model
and neither imports the other. `@boxxy/model` re-exports `ContentHash` from `libs/content-hash`,
which also holds the hash helpers.

`scripts/` is not a workspace package, so the import zones leave it alone, and a script may do I/O.
`turbo boundaries` refuses a root dependency on a module, so the root `package.json` depends on libs
only. A script that needs a module, such as `scripts/write-concept-pins.ts`, imports the module's
source by relative path.

## Dependency rules

```mermaid
flowchart LR
  app --> module
  app --> adapter
  app --> lib
  app --> deployed[deployed package]
  module --> module
  module --> lib
  adapter --> module
  adapter --> lib
  deployed --> lib
  lib --> lib
  cli -. tests only .-> server
```

`turbo boundaries` fails a dependency that the diagram doesn't show, so an adapter never depends on
another adapter, and only an app depends on an adapter or a deployed package. A deployed package's
`turbo.json` tag is `package`.

A module never imports an adapter: it takes each outside system through a port, such as `ClaimStore`
in `libs/model`, that the app fills. A module therefore runs on plain values, so a test runs it
without a store or a network, and a replay can rerun it on recorded inputs.

A deployed package depends on libs only, so it pulls as little of boxxy as it can into the other
repo's deployment: a lib holds the types and ports it needs, and a module would drag the domain in.
A deployed package that needs an adapter's work takes it through a port in `libs/model`, as a module
does. The `pepys` edge of the import zones also fails an import of a deployed package from a module
or a lib. A lib that a deployed package depends on is installed with it, so such a lib lists its
test-only libraries in `devDependencies`.

An app never depends on another app, with one exception: the CLI's tests drive the real server. The
test layout puts every test outside `e2e/`, `evals/` and `bench/` beside the source file it tests,
so those tests sit in the CLI package, beside the CLI code they drive. Three checks keep the server
out of the CLI that ships:

- `@boxxy/cli` lists `@boxxy/server` in `devDependencies` only. Each app carries a second tag, `cli`
  or `server`, and the `server` tag accepts only a `cli` package as a dependent. `turbo boundaries`
  therefore fails any other package that depends on the server.
- The `server-test-utils` edge lets the CLI import the server only through its
  `@boxxy/server/test-utils/*` exports.
- The `server-in-tests` edge lets only a CLI test file or a file in `apps/cli/src/test-utils/` make
  that import.

Two CLI test utils drive the real server with the CLI's dev dependencies: `create-test-cli`, and the
verify CLI in `apps/cli/src/test-utils/verify/`, the `bun verify` command of
[Verify journeys](./verify-journeys.md). `files` in the CLI's `package.json` and its
`tsconfig.build.json` leave both out of the published package. A test of one app alone uses a fake
`fetch`.

## Import pins

The `zgeoff/import-zones` rule in `.oxlintrc.json` holds named entries. Each library pin in this
table pins a set of libraries to the packages that may import them. The edges between packages are
in [Dependency rules](#dependency-rules), and `network`, `domain-io` and `unresolved` come below.

| Entry          | Libraries                                                                                                                           | Packages that may import them                                   |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `sqlite`       | `bun:sqlite`, `kysely`, `@zgeoff/kysely-bun-sqlite`                                                                                 | `adapters/store-sqlite`, `adapters/auth-oauth`                  |
| `oauth`        | `@zgeoff/mcp-auth`, `@zgeoff/mcp-auth/elysia`, `@zgeoff/mcp-auth/testing`                                                           | `adapters/auth-oauth`                                           |
| `atc`          | `@modelcontextprotocol/client`                                                                                                      | `adapters/worker-atc`                                           |
| `imp-identity` | `@impz/client`, `@impz/client/identity`                                                                                             | `adapters/caller-proof-imp`                                     |
| `noslop`       | `@noslop/cli`, `@noslop/cli/check`, `@noslop/cli/post`                                                                              | `adapters/review-noslop`                                        |
| `github-app`   | `@octokit/auth-app`, `@octokit/request`                                                                                             | `adapters/forge-github`                                         |
| `pepys-kit`    | `@pepys/api`, `@pepys/ingest`, `@pepys/kit`, `@pepys/kit/send`, `@pepys/source-github`, `@pepys/source-telemetry`, `@pepys/testing` | `packages/pepys`                                                |
| `wringer`      | `@wringer/browser`, `@wringer/db`, `@wringer/gunshi`, `@wringer/http`, `@wringer/mcp`, `@wringer/stream`                            | the verify CLI                                                  |
| `wringer-core` | `@wringer/core`                                                                                                                     | `adapters/verifier-wringer`, the verify CLI, two CLI test files |
| `yaml`         | `yaml`                                                                                                                              | `modules/rules`                                                 |
| `xstate`       | `xstate`                                                                                                                            | `modules/dispatch`                                              |
| `liquid`       | `liquidjs`                                                                                                                          | `libs/prompt-template`                                          |

Each outside system has one adapter or deployed package that talks to it, and an entry pins its
client library there. The exceptions:

- `adapters/auth-oauth` opens the auth database with the store's SQLite libraries. It never opens
  the store.
- `adapters/notifier-atc` reaches atc without the MCP client: the server builds a client with the
  `worker-atc` factory and passes the notifier its one send call.
- wringer is pinned to the verify CLI, a test helper of the CLI. `@wringer/core` renders and reads
  the verify report, so `adapters/verifier-wringer` imports it to read a pull request's report for
  the server, and the CLI's two merge tests in `apps/cli/src/commands/` import it to render one.

The `yaml`, `xstate` and `liquid` rows pin a library to the one module or lib whose job needs it.
Every rules file reaches the other packages through `loadRules` in `modules/rules`, and xstate runs
only the attempt machine. `modules/rules` checks each prompt template at load and `modules/dispatch`
renders it at claim, so the template engine and its settings live in a lib that both import.

The `network` entry lets only an adapter or a deployed package call `fetch`. An app that wires an
adapter passes `fetch` in as an argument. Lint can't tell which outside system a `fetch` reaches, so
the reviewer of a change checks that each call goes through the package that owns its outside
system: GitHub through `forge-github`, and the pepys ingest through `packages/pepys`.

oRPC has no entry, so the reviewer checks these rules:

- Only `libs/contract` defines a procedure, with `oc` and `mcp.tool`.
- `apps/server` serves the contract, with `@orpc/server`, `@orpc/mcp` and
  `@modelcontextprotocol/server`, and calls the pepys query API with `@orpc/client`.
- `apps/cli` calls the server with `@orpc/client`.
- Two test helpers outside the apps import these libraries too. The atc stand-in in
  `adapters/worker-atc/src/test-utils/` serves atc's tools on `@modelcontextprotocol/server`, the
  library the atc gateway uses. The test pepys deployment in `packages/pepys/src/test-utils/` calls
  the pepys query API with `@orpc/client`.

Only `apps/server` imports `elysia`. `adapters/auth-oauth` lists `elysia` as a dependency because
the Elysia adapter of `@zgeoff/mcp-auth` needs it as a peer.

To keep `modules/**` and `libs/**` free of I/O, the `domain-io` entry fails an import of `node:fs`,
`node:child_process`, `node:net`, `node:http` or `node:https` there, and oxlint's
`no-restricted-globals` rule fails any use of the `Date`, `process` or `Bun` globals. Time and
settings come into a module or a lib as arguments, so a test or a replay sets them.

A package imports another only through an entry point that the other's `exports` lists, such as `.`
for its `src/index.ts`, or `./test-utils/*` for tests. The `unresolved` entry fails a deep import,
such as `@boxxy/planning/src/decide.ts`, whose path no `exports` key lists.

## Inside a package

These rules of `@zgeoff/oxlint-config` apply to a package's `src/`:

- `zgeoff/file-named-for-export`: one export of each file has the file's name, so a file is named in
  kebab case for its main export. `index.ts`, `types.ts` and `constants.ts` are exempt, in any
  folder.
- `zgeoff/feature-folders`: the root of `src/` holds 8 loose source files at most. The count leaves
  out `index.ts`, `types.ts`, `constants.ts`, tests, and each entry point listed in `package.json`.
  When a package outgrows the root, its source files go into one folder per thing the package does,
  such as `attempts/` and `claims/` in `modules/dispatch`.
- `zgeoff/feature-folders` again: code that two feature folders share lives in `src/utils/`, and a
  file in `utils/` imports no feature folder, type imports included. `test-utils/` and `generated/`
  are not feature folders.

To place a new file:

- Put code in a file at the root of `src/`, or in the feature folder of the subject it belongs to.
  `src/index.ts` only re-exports.
- Put a folder's types in its own `types.ts`, and its fixed values in its own `constants.ts`.
- Put a concept in `modules/planning/src/concepts/`. A concept is the plug-in code behind a kind of
  pool or a lever that the rules file names: `pool` filters and orders the ready items, and `defer`
  and `expedite` are the levers. Give each concept a file of its own, named after it, that exports
  it under that bare name, and add it to the list in `concepts.ts`. The planning core,
  `build-frame.ts`, `decide.ts` and `propagate.ts`, never imports a concept: an override in
  `.oxlintrc.json` fails such an import, so the core reads concepts only through the loaded rules.
- Put a phase kind in `modules/closeout/src/phases/`, one file per kind, named and exported the same
  way, such as `build`.
- Put a store migration in `adapters/store-sqlite/src/migrations/`, one file per migration, and an
  auth database migration in `adapters/auth-oauth/src/migrations/`.
- Leave `generated/` to the script that writes it. The `build` script of `modules/planning` writes
  `src/generated/concept-pins.ts`, which records each concept's version and a hash of its source.
  The rules version includes them, so a replay reruns the same concept code. `pepys build` writes
  the glue in `packages/pepys/src/generated/`, which lint and the formatter skip.
- Write the attempts table, the attempt sessions table or a seat only from
  `attempts/build-attempt-change.ts` in `modules/dispatch`, the one caller of the attempt machine.
  The test of `scripts/collect-attempt-writes` fails on such a write in any other source file of the
  package, though tests and test fixtures may seed those tables. One write of seats bypasses that
  file: on each tick the runner calls the store's `syncLimits`, which rewrites the seats when the
  loaded limits change which attempts they count.

Tests and their helpers follow the test layout that `bun run check:test-layout` (`chex test-layout`)
enforces:

- A package's test helpers, such as its fakes and factories, live in its `src/test-utils/`, which
  the package exports as `./test-utils/*` for other packages' tests. Production code never imports a
  test helper. A helper that two or more packages' tests use lives in the package that owns what it
  starts, builds or fakes, and another package imports it by name, with that package as a
  `workspace:*` dev dependency.
- An end-to-end test lives, flat, in the `e2e/` folder of the package that builds the program it
  runs. A benchmark or an eval suite lives in the `bench/` or `evals/` folder of the package whose
  code it measures, as `adapters/store-sqlite/bench/` does for the store's claim. Every other test
  is a unit test, beside the file it tests as `<file>.test.ts`, and `bun run test` runs it.
- The repo root holds no `test-utils/` or `e2e/` folder.

## Where a helper goes

Put a helper in the first place on this list that fits:

1. Used by one file: below its caller, in that file.
2. Used by 2 or more files in one package: its own file, named for its export, in that package: in
   the feature folder that uses it, or in `src/utils/` when two feature folders do.
3. Used by 2 or more packages and specific to boxxy: a lib named for what it does.
4. Generic, with nothing specific to boxxy: `@zgeoff/std`, added there upstream.
