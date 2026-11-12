# 0015: The stack

Date: 2026-11-04
Updated: 2026-11-12: the API moved to oRPC v2 beta, and the CLI to `parseArgs`.

## Decision

boxxy uses the newest stack in use across atc, nixie, pepys, noslop and wringer, with wringer
weighted most, picked by commit date where the repos disagree. The
[tech stack design](../design/boxxy/tech-stack.md) gives where each choice comes from, and the root
catalog pins each version.

- Runtime and language: Bun 1.4.4, and TypeScript 7 with tsrs.
- Lint and format: oxlint with tsrslint for type-aware lint, and oxfmt, with the shared configs.
- API: oRPC v2 beta on Elysia 2.0 rc, because v2 has the MCP integration
  ([decision 0017](./0017-v1-scope.md)).
- Store: Kysely on `bun:sqlite`.
- Libraries: zod 4, LogTape for logs, and ts-pattern. The CLI reads its flags with `node:util`
  `parseArgs` ([the CLI](../design/boxxy/v1-cli.md#commands)).
- Tests: `bun test`, run through `@zgeoff/rig`.
- Release: release-please, with npm trusted publishing.
- Shared files: repo-sync, like every other repo. It also delivers the chex checks.

## Rejected alternatives

| Option                                           | Why not                                                                                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Elysia 1.4                                       | Elysia 2.0 rc runs oRPC 1.16 in pepys, and a pepys spike passed with MCP beside it; the project adopts new major versions early |
| oRPC 1.16                                        | has no MCP integration, and the server serves its contract as MCP too                                                           |
| gunshi for the CLI                               | a table of commands needs only flags and words, which `parseArgs` reads                                                         |
| Turso with pepys's own Kysely dialect            | boxxy needs one local SQLite file with a write transaction, which `bun:sqlite` gives                                            |
| oxlint-tsgolint for type-aware lint              | the older setup; the other repos moved to tsrslint                                                                              |
| the chex lefthook baseline in place of repo-sync | repo-sync already delivers the chex baseline, as `.lefthook/pre-push-baseline.yml`, with the other shared files |
| tsdown for declarations                          | the newer repos emit declarations with tsrs                                                                                     |
| a result library such as Effect or neverthrow    | no repo uses one; expected outcomes are union values branched with ts-pattern                                                   |

## Why

The five repos share one toolchain, and boxxy is built and reviewed by the same agents and shared
skills. Picking the newest choice where they disagree keeps boxxy from starting behind, and
repo-sync keeps it in step with the others afterwards.
