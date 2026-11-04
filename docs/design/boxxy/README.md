# boxxy design

boxxy dispatches an agent fleet's work and measures it. It holds work items, runs each phase of an
item as one attempt through a worker, decides what runs next with a pure `decide()` over plug-in
planning concepts, and records everything as facts in pepys. It measures recipes and rules with live
experiments, so every part of the system can be compared and improved. Packages publish as
`@boxxy/<package>`.

## Design docs

- [Architecture](./architecture.md): the parts and how they reach each other, the principles, and
  the generic core.
- [Core model](./core-model.md): items, links, phases and pipelines, attempts, workers, entry
  points, asks and grants.
- [Rules](./rules.md): policy in a git config repo, levers as facts, the plug-in kinds registry and
  replay CI.
- [Planning](./planning.md): concepts as plug-ins, `buildFrame()` and `decide()`, pools, ordering
  levers, explain and the proposed forecast.
- [Dispatch](./dispatch.md): `claimNext` in one transaction, leases and generation numbers, the benchmark,
  faults and reconcile.
- [Close-outs](./close-outs.md): the typed outcome of an attempt, what is derived from facts, and
  links to commits and PRs.
- [Measurement](./measurement.md): spend capture, queries, experiments and the verdict.
- [Capacity](./capacity.md): capacity sources, the router and the pacing gate.
- [Merge train](./merge-train.md): review and merge, stacks as units, batching and the conflict
  rules.
- [Layout](./layout.md): the workspace, package tags and import rules, and where a helper goes.
- [Tech stack](./tech-stack.md): the runtime, libraries and repo tooling.
- [Slice 1](./slice-1.md): what the first build includes and leaves out.

## Reading order

1. Read [architecture](./architecture.md), then [core model](./core-model.md), for the parts and
   the nouns.
2. Read [planning](./planning.md), then [dispatch](./dispatch.md), for how work gets picked and
   claimed.
3. Read [slice 1](./slice-1.md) before you build, then [layout](./layout.md) and
   [tech stack](./tech-stack.md) for where the code goes.
4. Read the other docs when your work touches them.

The decisions behind the design are in [docs/decisions](../../decisions/).
