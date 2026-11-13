---
name: project-testing
description:
  'The test commands, helpers and stand-ins of the boxxy repo, and the testing rules it replaces.
  Load it beside testing before you write or review a test or a benchmark in boxxy.'
metadata:
  kind: rule-set
---

# boxxy testing

## Facts

| Fact          | Where                                                                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Test commands | the `test`, `test:related` and `bench` scripts in the root [`package.json`](../../../package.json); [`rig.config.ts`](../../../rig.config.ts) adds no lane to `rig`'s own |
| Test utils    | `src/test-utils/` of the package that owns what the helper starts, builds or fakes                                                                                        |

## Departures

- Put a benchmark in `bench/<name>.bench.ts` of its package, even when it measures one module, and
  its logic in `src/test-utils/`. [Benchmarks](../testing/references/system-tests.md#benchmarks)
  puts a module benchmark in `src/`, but `rig bench` runs only the files in a `bench/` folder.

- When a CLI test file needs more than one wiring of the real server, give its one `setupTest()` a
  member for each extra wiring, such as `mergeAtHead`. In a test of that wiring, write
  `const setup = await setupTest();` and then `const ctx = setup.mergeAtHead;`.
  [setupTest](../testing/SKILL.md#setuptest) binds the result to `ctx` itself. Here a CLI module has
  one test file, and two wirings collide on names such as `run`.

## Stand-ins

- Look in `src/test-utils/` of `@boxxy/dispatch` first. It holds the memory store, the claim store
  contract, a fake of each port that the core calls, and `createTestDispatch`, which wires them to
  the example rules. Search there for `create-fake-` and `build-mock-` before you write a new one.
- Test a new store against the claim store contract, as the SQLite store's own test does. Then the
  memory store and the real store stay in step.
- Test the CLI against the real server with `createTestCLI` from `apps/cli/src/test-utils/`, in a
  unit test beside the CLI module the test drives. It runs both apps in the test process, and
  `bun run test` runs it, as it runs every test outside `e2e/`, `evals/` and `bench/`.
- Import the server only from a CLI test or a CLI test util, and only through
  `@boxxy/server/test-utils/*`, such as `make-broker-send`. Lint fails any other import of the
  server from the CLI, as the [layout](../../../docs/design/boxxy/layout.md#dependency-rules) says.
