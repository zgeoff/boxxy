# 0016: The workspace layout

Date: 2026-11-04 Updated: 2026-11-05

## Decision

boxxy splits its workspace into `apps/`, `modules/`, `adapters/` and `libs/`, as noslop and nixie
do, with wringer's package conventions. The [layout design](../design/boxxy/layout.md) gives the
tree and where a helper goes.

- Apps are composition roots: they build the adapters and pass them to modules.
- Modules hold the domain and do no I/O. A module never imports an adapter.
- Adapters are one package per outside system, named `<port>-<system>`, such as `store-sqlite`.
- Libs hold the types, schemas and pure helpers that two or more packages use, and do no I/O.
  `@boxxy/model`, the home of every shared type, is a lib, so `@boxxy/contract` can import it.
- `turbo boundaries` tags enforce which kind may import which. `zgeoff/import-zones` pins each
  single-owner import, such as `bun:sqlite` to `adapters/store-sqlite`, and bans I/O, `Date` and
  `process` in `modules/` and `libs/`.
- Packages import each other only through `index.ts`.
- Only slice 1's packages are created; the rest of the tree gives a home for each later piece.

## Rejected alternatives

| Option                                                           | Why not                                                                                                     |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| wringer's flat `packages/<folder>`                               | boxxy talks to several outside systems from the start: the store, atc, pepys, GitHub and capacity providers |
| atc's nested `packages/` with folder zones                       | it enforces direction with zones only, with no package-kind tags                                            |
| guards against dumping grounds: name, depth or file-count checks | dropped when the layout was signed off; the boundary tags and import zones are the enforced guards          |

## Why

The core must stay pure (see [0005](./0005-the-core-stays-generic.md)), and the split makes that a
build failure instead of a review comment. noslop and nixie run this split with the same tags, so
agents that work across the repos meet one rule.
