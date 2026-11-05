# Layout

boxxy is one Bun workspace split into apps, modules, adapters and libs. Modules hold the domain and
do no I/O; adapters talk to one outside system each; apps build the adapters and pass them to the
modules. Two lint checks enforce the split: turbo boundaries tags between packages, and
`zgeoff/import-zones` pins for libraries that only one package may import.

The decision behind this doc is [0016: layout](../../decisions/0016-layout.md). The stack and the
repo setup files are in [tech stack](./tech-stack.md).

## Workspace

```text
boxxy/
├── apps/                        composition roots: build adapters, pass them to modules
│   ├── cli/                     @boxxy/cli: gunshi commands
│   └── server/                  @boxxy/server: Elysia + oRPC API, the runner loop
├── modules/                     the domain; no I/O, no adapter imports
│   ├── rules/                   rules loader, plug-in kind registry, rules version hash
│   ├── planning/                buildFrame, decide, explain + built-in concepts
│   ├── dispatch/                claimNext over a ClaimStore port; leases, fencing
│   ├── closeout/                close-out parse, criteria → evidence, openItems dedupe
│   ├── measurement/   (slice 2) experiments, assignment, verdict, metric + cohort plug-ins
│   ├── capacity/      (slice 2) capacity sources, router, pacing gate
│   └── train/         (later)   merge train rules
├── adapters/                    one package per outside system, named <port>-<system>
│   ├── store-sqlite/            the only bun:sqlite + Kysely user; migrations
│   ├── worker-atc/              spawns attempts through atc, reads back their session ids
│   ├── facts-pepys/             the FactSink append client and the cost reader for pepys (the consumer lives in pepys)
│   ├── forge-github/            PR and commit links, later the train's merges
│   └── capacity-<provider>/   (slice 2) one per capacity source
├── libs/                        shared types, schemas and pure helpers; no I/O
│   ├── model/                   every type 2+ packages share, the fact catalog, schemas, derived state
│   ├── contract/                the oRPC contract the server serves and the CLI calls
│   └── content-hash/            the ContentHash type and hashes for recipes, rules versions, verdicts
├── docs/                        design/ and decisions/
├── scripts/                     repo tooling; may do I/O and import any workspace package
├── test-utils/                  cross-package test helpers
├── integration/                 tests that run the repo's checks on fixtures, such as bad imports
└── e2e/                         end-to-end lane
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

| Tag     | May import           |
| ------- | -------------------- |
| app     | module, adapter, lib |
| module  | module, lib          |
| adapter | module, lib          |
| lib     | lib                  |

A module never imports an adapter. A module that needs an outside system declares a port, such as
`ClaimStore`; an adapter implements it; the app builds the adapter and passes it in. This keeps
`decide()` pure, so a replay can rerun it on recorded facts (see [dispatch](./dispatch.md)).

A package's `turbo.json` holds only its tag:

```json
{ "extends": ["//"], "tags": ["module"] }
```

## Import pins

Each outside system has one package that may talk to it:

| Outside system | Package                 | What lint checks                                                      |
| -------------- | ----------------------- | --------------------------------------------------------------------- |
| the store      | `adapters/store-sqlite` | only it imports `bun:sqlite`, `kysely` or `@zgeoff/kysely-bun-sqlite` |
| atc            | `adapters/worker-atc`   | only it imports `@atcx/contract`                                      |
| GitHub         | `adapters/forge-github` | only an adapter calls `fetch`                                         |
| pepys          | `adapters/facts-pepys`  | only an adapter calls `fetch`                                         |

The `zgeoff/import-zones` rule in `.oxlintrc.json` holds these pins. Lint can't tell which adapter a
`fetch` reaches, so review checks that GitHub calls stay in `forge-github` and pepys calls in
`facts-pepys`.

`modules/**` and `libs/**` do no I/O. The import zones fail an import of `node:fs`,
`node:child_process`, `node:net`, `node:http` or `node:https` there, and oxlint's
`no-restricted-globals` rule fails any use of the `Date`, `process` or `Bun` globals. Time and
environment come into a module or a lib as arguments, so a test or a replay sets them.

Packages import each other only through their `index.ts`. The one exception is a package's
`./test-utils` entry, which other packages' tests import. A deep import, such as
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
│   └── concepts/            one file per concept, named after it
│       ├── pool.ts
│       ├── defer.ts
│       └── expedite.ts
└── test-utils/              this package's factories, exported as "./test-utils"
```

- `src/index.ts` only re-exports. Code lives in the files beside it.
- Each file has one main export, and the file is named after it in kebab case.
- A test sits beside the file it tests, as `<file>.test.ts`.
- A package with concepts keeps them in `src/concepts/`, one file per concept, named after it. A new
  concept is a new file there.
- A package's own test factories live in its `test-utils/` folder, which the package exports as
  `./test-utils` for other packages' tests.

## Where a helper goes

Put a helper in the first place on this list that fits:

1. Used by one file: below its caller, in that file.
2. Used by 2 or more files in one package: its own file, named for its export, in that package.
3. Used by 2 or more packages and specific to boxxy: a lib named for what it does.
4. Generic, with nothing specific to boxxy: `@zgeoff/std`, added there upstream.
