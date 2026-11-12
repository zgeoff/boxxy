# Layout

boxxy is one Bun workspace split into apps, modules, adapters, libs and packages. Modules hold the domain and
do no I/O; adapters talk to one outside system each; apps build the adapters and pass them to the
modules. Two lint checks enforce the split: turbo boundaries tags between packages, and
`zgeoff/import-zones` pins for libraries that only one package may import.

The decision behind this doc is [0016: layout](../../decisions/0016-layout.md). The stack and the
repo setup files are in [tech stack](./tech-stack.md).

## Workspace

```text
boxxy/
├── apps/                        composition roots: build adapters, pass them to modules
│   ├── cli/                     @boxxy/cli: the boxxy command and the hooks
│   └── server/                  @boxxy/server: Elysia + oRPC API, the runner loop
├── modules/                     the domain; no I/O, no adapter imports
│   ├── rules/                   rules loader, plug-in kind registry, rules version hash
│   ├── planning/                buildFrame, decide, explain + built-in concepts
│   ├── dispatch/                claimNext over a ClaimStore port; leases, fencing
│   ├── closeout/                the phase kinds: close-out parse, settle, input; openItems dedupe
│   ├── measurement/   (slice 2) experiments, assignment, verdict, metric + cohort plug-ins
│   ├── capacity/      (slice 2) capacity sources, router, pacing gate
│   └── train/         (next)    the merge rule; later the merge train
├── adapters/                    one package per outside system, named <port>-<system>
│   ├── store-sqlite/            the only bun:sqlite + Kysely user; migrations
│   ├── worker-atc/              spawns attempts through atc, reads back their session ids
│   ├── notifier-atc/            sends a hold notice as an atc message
│   ├── forge-github/            PR and commit links, checks, and (next) the merge
│   ├── review-noslop/ (next)    runs the review tool for the ReviewGate port
│   ├── verifier-wringer/ (next) reads the verify tool's report for the Verifier port
│   ├── caller-proof-imp/        proves a session's caller from the broker's identity token
│   └── capacity-<provider>/   (slice 2) one per capacity source
├── libs/                        shared types, schemas and pure helpers; no I/O
│   ├── model/                   every type 2+ packages share, the fact catalog, schemas, derived state
│   ├── contract/                the oRPC contract the server serves and the CLI calls
│   └── content-hash/            the ContentHash type and hashes for recipes, rules versions, verdicts
├── packages/                    packages that another repo's deployment installs
│   └── pepys/                   @boxxy/pepys: the pepys plug-in, the FactSink adapter and the pepys reader
├── system-tests/                @boxxy/system-tests: tests that run more than one app together
├── docs/                        design/ and decisions/
└── scripts/                     repo tooling; may do I/O and import any workspace package
```

The repo creates a package only when a slice needs it. The tree lists the later packages so each
later piece has a decided home: [slice 1](./slice-1.md) lists the packages it creates, and
[measurement](./measurement.md), [capacity](./capacity.md) and [merge train](./merge-train.md)
describe the later ones.

Each package's folder name is its package name under `@boxxy/`: `modules/planning` is
`@boxxy/planning`, and `adapters/store-sqlite` is `@boxxy/store-sqlite`.

A lib holds types, schemas and pure helpers that two or more packages use. Every type that two or
more packages share lives in `@boxxy/model`, in `libs/model`, so the modules, the adapters and
`@boxxy/contract` all import it, and no two modules import each other in a cycle.

## Dependency rules

Each package's `turbo.json` carries one tag, and `turbo boundaries` fails an import that the tag
doesn't allow:

| Tag     | May import                   |
| ------- | ---------------------------- |
| app     | module, adapter, lib, package |
| module  | module, lib                  |
| adapter | module, lib                  |
| lib     | lib                          |
| package | lib                          |
| system-test | app, module, adapter, lib, package |

`system-tests` is the only package tagged `system-test`. A test of two apps together, such as the CLI
against the real server, belongs to neither app, and an app may not import another app. So the test
lives in `@boxxy/system-tests`, which is private and not published. It has no release entry, and no
package imports it. Its tests import each app through the app's `index.ts` and its `./test-utils/*`
entry. A test of one app alone stays beside that app's code and uses a fake `fetch`. An
end-to-end test that starts two apps lives here too.

A module never imports an adapter. A module that needs an outside system declares a port, such as
`ClaimStore`; an adapter implements it; the app builds the adapter and passes it in. This keeps
`decide()` pure, so a replay can rerun it on recorded facts (see [dispatch](./dispatch.md)).

Every package under `packages/` carries the tag `package`. Another repo's deployment installs such
a package, such as `@boxxy/pepys` in the pepys deployment, so it must pull in as little of boxxy as
possible. It imports libs only: a lib holds the types and ports it needs, and a module would drag
the domain into the deployment. Only an app imports a package, because the app is the one place that
builds what the packages provide. No module, adapter or lib does, which is also the rule that keeps
`@boxxy/pepys` out of the modules and `@boxxy/model`. A package that needs an adapter's work takes
it through a port in `libs/model`, as a module does.

A lib that a package depends on is installed with it, so such a lib keeps its test-only libraries
in `devDependencies`. `@boxxy/model` lists `@faker-js/faker` there: its fakes in `src/test-utils/`
use it, and `src/index.ts` imports none of them.

A package's `turbo.json` holds only its tag:

```json
{ "extends": ["//"], "tags": ["module"] }
```

## Import pins

Each outside system has one package that may talk to it:

| Outside system | Package                 | What lint checks                                                      |
| -------------- | ----------------------- | --------------------------------------------------------------------- |
| the store      | `adapters/store-sqlite` | only it imports `bun:sqlite`, `kysely` or `@zgeoff/kysely-bun-sqlite` |
| atc            | `adapters/worker-atc`   | only it imports `@modelcontextprotocol/client`, to call the atc gateway's MCP tools |
| imp identity   | `adapters/caller-proof-imp` | only it imports `@impz/client` or `@impz/client/identity`         |
| GitHub         | `adapters/forge-github` | only an adapter or a package calls `fetch`                            |
| pepys          | `packages/pepys`        | only it imports `@pepys/kit`, `@pepys/testing`, `@pepys/ingest`, `@pepys/api`, `@pepys/source-github` or `@pepys/source-telemetry`; no module and no lib imports `@boxxy/pepys` |

oRPC has an owner and no lint pin. Only `libs/contract` calls `oc` and `mcp.tool` to define a procedure. `apps/server` imports `@orpc/server`, `@orpc/mcp` and `@modelcontextprotocol/server` to serve the contract, and `@orpc/client` to call the pepys query API. The atc stand-in in `adapters/worker-atc/src/test-utils/` imports `@modelcontextprotocol/server` too, to serve atc's tools on the library the atc gateway uses; the package lists it as an optional peer. `apps/cli` imports `@orpc/client` to call the server, and the real-pepys test deployment of `packages/pepys` imports it to call the pepys query API in process. Only `apps/server` imports `elysia`, and it lists Elysia's peers `exact-mirror`, `openapi-types` and `typebox` as its own dependencies. `@pepys/api` brings its own Elysia, `exact-mirror` and `typebox`, which the lockfile nests under it. All oRPC packages sit at one exact version, `2.0.0-beta.50`, in the root catalog. `@impz/client` brings its own `@orpc/client` 1.x, which the lockfile nests under it, so every boxxy package resolves the catalog version.

Two libraries have a pin of their own. Only `modules/rules` imports `yaml`, so every rules file
reaches the other packages through `loadRules`. Only `modules/dispatch` imports `xstate`, for the
attempt state table.

The `zgeoff/import-zones` rule in `.oxlintrc.json` holds these pins. Its `pepys` edge holds the pin for `@boxxy/pepys`, and its `pepys-kit` rule the pin for the kit. Lint lets an adapter and a package under `packages/` call `fetch`, and can't tell which one a
`fetch` reaches, so review checks that GitHub calls stay in `forge-github` and pepys calls in
`packages/pepys`.

`modules/**` and `libs/**` do no I/O. The import zones fail an import of `node:fs`,
`node:child_process`, `node:net`, `node:http` or `node:https` there, and oxlint's
`no-restricted-globals` rule fails any use of the `Date`, `process` or `Bun` globals. Time and
environment come into a module or a lib as arguments, so a test or a replay sets them.

Packages import each other only through their `index.ts`. The one exception is a package's
`./test-utils/*` entry, which other packages' tests import. A deep import, such as
`@boxxy/planning/src/decide.ts`, is banned: the import zones fail an import whose path no `exports`
key of the package lists.

## Inside a package

```text
modules/planning/
├── package.json  turbo.json  tsconfig.json  README.md
├── src/
│   ├── index.ts             the public API: re-exports only
│   ├── types.ts
│   ├── build-frame.ts       one main export per file, named after it
│   ├── build-frame.test.ts  tests sit beside the file
│   ├── decide.ts
│   ├── explain.ts
│   ├── propagate.ts         runs the propagation lines, which are rules data
│   ├── concepts/            one file per concept, named after it
│   │   ├── pool.ts
│   │   ├── defer.ts
│   │   └── expedite.ts
│   └── test-utils/          this package's test helpers, exported as "./test-utils/*"
└── e2e/                     end-to-end tests of a program this package builds
```

- `src/index.ts` only re-exports. Code lives in the files beside it.
- Each file has one main export, and the file is named after it in kebab case.
- A test sits beside the file it tests, as `<file>.test.ts`.
- A package with concepts keeps them in `src/concepts/`, one file per concept, named after it. A new
  concept is a new file there.
- A package's test helpers, such as its fakes and factories, live in its `src/test-utils/` folder,
  which the package exports as `./test-utils/*` for other packages' tests. A helper that two or more
  packages' tests use lives in the package that owns what it starts, builds or fakes.
- An end-to-end test lives in the `e2e/` folder of the package that builds the program it runs, such
  as `apps/server/e2e/`. A test that needs two apps lives in `system-tests`, as
  [Dependency rules](#dependency-rules) says, at `system-tests/e2e/<name>.system.test.ts`. It runs
  both apps in the test process, so it takes the `.system` suffix of the `system` test lane in
  `rig.config.ts`, which `bun run test:system` runs, and never the `e2e` lane, which needs a built
  program. The repo root holds no `test-utils/` or `e2e/` folder, and
  `bun run check:test-layout` fails a test or a helper outside this layout.

The folders inside each package's `src/` are in [folder layout](./layout-folders.md).

## Where a helper goes

Put a helper in the first place on this list that fits:

1. Used by one file: below its caller, in that file.
2. Used by 2 or more files in one package: its own file, named for its export, in that package.
3. Used by 2 or more packages and specific to boxxy: a lib named for what it does.
4. Generic, with nothing specific to boxxy: `@zgeoff/std`, added there upstream.
