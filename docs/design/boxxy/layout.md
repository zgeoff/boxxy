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
│   ├── cli/                     @boxxy/cli (published): gunshi commands
│   └── server/                  @boxxy/server: Elysia + oRPC API, the runner loop
├── modules/                     the domain; no I/O, no adapter imports
│   ├── model/                   items, phases, attempts, facts, links: types + parsers
│   ├── rules/                   rules loader, plug-in kind registry, rules version hash
│   ├── planning/                buildFrame, decide, explain + built-in concepts
│   ├── dispatch/                claimNext over a ClaimStore port; leases, fencing
│   ├── closeout/                close-out types per phase kind, parse, criteria → evidence
│   ├── measurement/   (slice 2) experiments, assignment, verdict, metric + cohort plug-ins
│   ├── capacity/      (slice 2) capacity sources, router, pacing gate
│   └── train/         (later)   merge train rules
├── adapters/                    one package per outside system, named <port>-<system>
│   ├── store-sqlite/            the only bun:sqlite + Kysely user; migrations
│   ├── worker-atc/              spawns attempts through atc, reads back their session ids
│   ├── facts-pepys/             the outbox and the append client for pepys (the consumer lives in pepys)
│   ├── forge-github/            PR and commit links, later the train's merges
│   └── capacity-<provider>/   (slice 2) one per capacity source
├── libs/                        boxxy-wide pieces with 2+ package users, named for what they do
│   ├── contract/                the oRPC contract the server serves and the CLI calls
│   └── content-hash/            hashes for recipes, rules versions, verdicts
├── docs/                        design/ and decisions/
├── scripts/                     repo tooling only
├── test-utils/                  cross-package test helpers
└── e2e/                         end-to-end lane
```

The repo creates a package only when a slice needs it. The tree lists the later packages so each
later piece has a decided home: [slice 1](./slice-1.md) lists the packages it creates, and
[measurement](./measurement.md), [capacity](./capacity.md) and [merge train](./merge-train.md)
describe the later ones.

Each package's folder name is its package name under `@boxxy/`: `modules/planning` is
`@boxxy/planning`, and `adapters/store-sqlite` is `@boxxy/store-sqlite`.

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

The `zgeoff/import-zones` rule in `.oxlintrc.json` pins each outside library to the one package that
owns it:

| Import                 | Allowed only in         |
| ---------------------- | ----------------------- |
| `bun:sqlite`, `kysely` | `adapters/store-sqlite` |
| the atc client         | `adapters/worker-atc`   |
| GitHub API calls       | `adapters/forge-github` |

`modules/**` may not use `node:fs`, `node:child_process`, `fetch`, or the `Date` and `process`
globals. Time and environment come into a module as arguments, so a test or a replay sets them.

Packages import each other only through their `index.ts`. The one exception is a package's
`./test-utils` entry, which other packages' tests import. A deep import, such as
`@boxxy/planning/src/decide.ts`, is banned.

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
│   └── concepts/            one subfolder per plug-in kind, one file per plug-in
│       ├── pools.ts
│       ├── defer.ts
│       └── expedite.ts
└── test-utils/              this package's factories, exported as "./test-utils"
```

- `src/index.ts` only re-exports. Code lives in the files beside it.
- Each file has one main export, and the file is named after it in kebab case.
- A test sits beside the file it tests, as `<file>.test.ts`.
- A package with plug-ins keeps them in one subfolder per plug-in kind, one file per plug-in. A new
  plug-in is a new file there.
- A package's own test factories live in its `test-utils/` folder, which the package exports as
  `./test-utils` for other packages' tests.

## Where a helper goes

Put a helper in the first place on this list that fits:

1. Used by one file: below its caller, in that file.
2. Used by 2 or more files in one package: its own file, named for its export, in that package.
3. Used by 2 or more packages and specific to boxxy: a lib named for what it does.
4. Generic, with nothing specific to boxxy: `@zgeoff/std`, added there upstream.
