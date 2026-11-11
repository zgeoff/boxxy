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

| Fact          | Where                                                                                                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Test commands | [`rig.config.ts`](../../../rig.config.ts), which adds no command to rig's own, and the `test`, `test:related` and `bench` scripts in the root [`package.json`](../../../package.json) |
| Test utils    | `src/test-utils/` of the package that owns what the helper starts, builds or fakes                                                                                                    |

## Departures

- Put a benchmark in `bench/<name>.bench.ts` of its package, even when it measures one module, and
  its logic in `src/test-utils/`. [Benchmarks](../testing/references/system-tests.md#benchmarks)
  puts a module benchmark in `src/`, but `rig bench` runs only the files in a `bench/` folder.

## Stand-ins

- Look in `src/test-utils/` of `@boxxy/dispatch` first. It holds the memory store, the claim store
  contract, a fake of each port that the core calls, and `createTestDispatch`, which wires them to
  the example rules. Search there for `create-fake-` and `build-mock-` before you write a new one.
- Test a new store against the claim store contract, as the SQLite store's own test does. Then the
  memory store and the real store stay in step.
