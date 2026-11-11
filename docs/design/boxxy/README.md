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
- [How boxxy ships](./release.md): the npm packages, the one version they share, the first publish
  of a new name, and what a deployment pins.
- [Slice 1](./slice-1.md): what the first build includes and leaves out.
- [v1](./v1.md): the four-phase pipeline and its rules, limits, recipes, the ledger and notices.
- [Attempt lifecycle](./v1-lifecycle.md): the attempt states in v1, the reconcile table, sleep and
  wake, close-outs, settle, the kept session and cleanup.
- [API and auth](./v1-api-and-auth.md): the v1 procedures and who may call each, the worker token
  and the proven caller.
- [Facts and pepys](./v1-facts-and-pepys.md): the outbox, the v1 fact catalog, the pepys package
  and its two queries.
- [Open for the builder](./v1-open.md): what the v1 sketches leave unchecked, assumed or not
  designed.
- [Work list](./v1-work-list.md): the v1 build as numbered slices, in dependency order.
- [Folder layout](./layout-folders.md): the folders inside each package.
- [Interface sketches](./sketches/README.md): the shape of each interface, as TypeScript files.

## Reading order

1. Read [architecture](./architecture.md), then [core model](./core-model.md), for the parts and
   the nouns.
2. Read [planning](./planning.md), then [dispatch](./dispatch.md), for how work gets picked and
   claimed.
3. Read [v1](./v1.md) and the [work list](./v1-work-list.md) before you build, then
   [layout](./layout.md), [folder layout](./layout-folders.md) and [tech stack](./tech-stack.md)
   for where the code goes. [Slice 1](./slice-1.md) specifies the code that v1 builds on.
4. Read the other docs when your work touches them.

The decisions behind the design are in [docs/decisions](../../decisions/).
