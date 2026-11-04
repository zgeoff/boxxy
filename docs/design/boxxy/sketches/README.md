# boxxy interface sketches

Build each boxxy interface to the shape in these TypeScript files: each port, registry, plug-in kind
and command. The design docs one folder up describe what each interface does, and the
[core model](../core-model.md) defines the terms these files use.

## Shape and behaviour

- A sketch is right about a shape: the names, fields and types.
- A design doc is right about behaviour: what happens, in what order, and when it fails.
- When a doc's behaviour needs a shape the sketch lacks, change the sketch in the same pull request
  as your code, and say why in the pull request description.

## Slices

The team builds boxxy in slices. A slice is one working version of boxxy, and
[slice 1](../slice-1.md) is the first.

- A comment above each interface names the slice in which it gets built, and the doc section that
  describes its behaviour.
- An interface for slice 1 has only the fields slice 1 uses. Each field that a later slice adds is
  in a type with the same name plus `Later`, such as `ConceptLater`. That type extends the slice 1
  type, so it has every slice 1 field too.

## Inside a file

Each file has three parts, in this order:

1. A call site: a short function that calls the file's main interfaces the way a caller in boxxy
   will, so you see them in use first.
2. The types.
3. One example plug-in of each plug-in kind the file defines.

The files have no implementations.

A file groups its interfaces by topic. Its header names the package that holds each part.
Every type that two or more packages share lives in `@boxxy/model`, whichever file declares it.

A plug-in kind that takes parameters is generic over them, such as `Gate<P>`. Its `params` field is
a `Schema<P>`, and its methods receive a `P`. Write a plug-in through its `define…` helper, such
as `defineGate`. The helper checks the plug-in against `P`, then returns it with a type that drops
`P`. A concept can then list plug-ins whose parameters differ.

## Files

Read the files in this order.

| File | Slice 1 | Later slices |
| --- | --- | --- |
| `00-core.ts` | Ids, `Instant`, actors, store rows, derived item state, recipes, the rules version, the build close-out's shape, facts | the `…Later` fields |
| `01-registries.ts` | `Schema`, `define…` helpers, `Concept`, item kinds, pipelines, the `rules.yaml` shape, the loader | concept parameters, sign-off gates |
| `02-ports.ts` | `ClaimStore`, `WorkerKind`, `FactSink`, `Forge`, `CostReader` | target providers, asks, grants |
| `03-commands.ts` | Every command, with its input, output and callers | the later command fields |
| `04-planning.ts` | `buildFrame`, `decide`, pools, signals, gates, waivers, propagation lines | admissions, pool gates, views, `explain` |
| `05-dispatch.ts` | `claimNext`, reconcile, settle | responses to mid-flight changes, triggers |
| `06-closeouts.ts` | The build close-out's parser, the criteria check and the dedupe | the other close-outs |
| `07-measurement.ts` | none | experiments, metrics, verdicts |
| `08-capacity.ts` | none | capacity sources, the router, the pacing gate |
| `09-merge-train.ts` | none | the merge gate and the merge train |

## Typecheck

The folder typechecks on its own, with no dependencies. `Schema` and `z` in `01-registries.ts`
stand in for zod's types and builder.

1. From the repo root, run:

   ```sh
   bun x tsc -p docs/design/boxxy/sketches --noEmit
   ```

   Expect: no output, and exit code 0.
