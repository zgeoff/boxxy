# Rules

boxxy takes two kinds of input, and stores them in two places
([decision 0003](../../decisions/0003-rules-in-git-levers-as-facts.md)). Policy, such as pools,
pipelines, gates, experiments and plug-in versions, lives in a git config repo, and boxxy loads it
from a merged commit as one [rules version](#the-rules-version). Levers, such as expedite, rank and
defer, are facts written through the command API, and act at once. A policy change is a PR that CI replays against past weeks before anyone
merges it. Every decision records the rules version in force.

## Policy in git

| What | Where it is described |
| --- | --- |
| pools | [planning](./planning.md#pools) |
| pipelines, gates and sign-offs | [core model](./core-model.md#phases) |
| responses to changes while an attempt runs | [core model](./core-model.md#changes-while-an-attempt-runs) |
| experiments | [measurement](./measurement.md) |
| merge train rules | [merge train](./merge-train.md) |
| plug-in versions | [the plug-in kinds registry](#the-plug-in-kinds-registry) |

- **boxxy loads rules only from a merged commit,** and reloads them live. A checkout with
  uncommitted changes fails the load.
- **A change is a PR.** It is diffable and reviewed, and CI replays it (see
  [replay CI](#replay-ci)).
- **A rules PR touches dispatch for the whole fleet,** so it takes the full review gate. A new rule
  set then runs as a challenger in shadow before promotion ([measurement](./measurement.md)).
- **The loader rejects a plug-in reference it can't check** (proposed): an unknown plug-in name,
  or parameters that fail the plug-in's schema. The experiment loader adds its own checks
  ([measurement](./measurement.md)).

## The rules version

boxxy hashes three inputs into one rules version:

- the config repo's commit hash;
- the bytes of every file the loader read;
- each concept pin: `name@version` and the content hash of the concept's source, meaning its module
  file and every file inside `@boxxy/planning` that it imports, transitively.

A replay needs the exact plug-in code, so the pins are part of the version. When the checkout moves
to a new commit, the loader builds a new version. When the loader rejects the commit, the previous
version stays live and the rejection shows in the runner status.

## Levers as facts

A lever is an owner or agent command that changes ordering now, with no PR:

- expedite;
- rank;
- defer and undefer;
- pool holds;
- overrides from a judgement phase, such as pin, admit and lift.

Each lever is a fact with its actor, time and reason, so `explain` shows it and its cost is a query.
[Planning](./planning.md) defines what each lever does. A lever never edits policy.

## The plug-in kinds registry

boxxy's behaviour beyond the core comes from plug-ins. Each plug-in kind is a strategy interface,
and the registry lists the kinds and the plug-ins of each kind:

| Plug-in kind | Doc |
| --- | --- |
| signal, gate, pool gate, waiver, admission, view, pool filter field | [planning](./planning.md#concepts) |
| item kind, link type, pipeline phase | [core model](./core-model.md) |
| worker kind (`start`, `reconcile`) | [core model](./core-model.md#workers) |
| close-out per phase kind | [close-outs](./close-outs.md) |
| metric, cohort key | [measurement](./measurement.md) |
| capacity source | [capacity](./capacity.md) |
| batch-size rule | [merge train](./merge-train.md) |

- **A rules version pins plug-in code** through its concept pins
  ([the rules version](#the-rules-version)), so a replay runs the code that decided. A replay that
  can't find a pinned version marks its explanation suspect.
- **A propagation line is rules data** that `buildFrame` runs, so the registry has no propagation
  kind ([planning](./planning.md#propagation)).
- **Plug-ins are compiled in.** The first slice loads no plug-in code at run time. The registry's
  interface is the same either way, so loading plug-ins later is an addition.
- **A rule that needs conditionals or loops becomes a typed plug-in.** The rules files hold names,
  parameters and orderings, never logic
  ([decision 0005](../../decisions/0005-the-core-stays-generic.md)).

## Agent-managed policy

Agents change policy the way they change code: by a PR to the config repo. Each plug-in declares a
typed schema for its parameters, and boxxy generates the API docs from the registry. An agent reads
those docs, then proposes a new signal, a pool change or a pipeline as a PR. The PR goes through the
same replay CI and review gate as a change the owner writes.

## Replay CI

A CI job in the config repo replays the last few weeks of recorded facts under the PR's rules, and
posts what would have changed: which items each pool would have picked, and when. Replay uses the
same mechanism as `explain` ([planning](./planning.md#explain)):

1. For each recorded decision, rebuild the frame from facts up to that decision's observation
   boundary ([dispatch](./dispatch.md#the-observation-boundary)).
2. Run `decide()` with the new rules version.
3. Compare its picks with the recorded picks.

The same replay, run with the recorded rules version, is boxxy's determinism test: every recorded
decision must come out the same. One case must stay in that test: dispatch, then deliver a CI fact
whose source time is earlier than the dispatch, then replay. The candidates and the snapshot hash
must match.
