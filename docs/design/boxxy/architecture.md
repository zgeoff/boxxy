# Architecture

boxxy has seven parts: the boxxy store, the planning core with `decide()`, the runners, the
workers, pepys, the rules repo and the telemetry path. The boxxy store is the only place that writes
claims. pepys holds every fact and builds every read table. The planning core is pure: it reads a
frame of facts and returns picks, and it owns no I/O. This doc gives each part's job, how the parts
reach each other, and the principles every other design doc follows.

## Parts

```text
 entry points: the owner's Claude Code session (mod) · CLI · agents filing work · nixie later
              │ typed commands (one command API, oRPC)
              ▼
 boxxy store (SQLite): items, links, asks, attempts, leases ──outbox──▶ pepys facts
              │ claimNext: buildFrame → decide → take leases              │
              ▼                                                           ▼
 runner: claim → recipe → start → settle                         read tables, queries:
              │                                                  spend, outcomes,
              ▼                                                  findings, explain
 workers: atc.session (local-pty, imp) · jobs: merge.forge · script
              │ OTel, hooks, atc event trail
              └────────────────────────────────────────────────────────▶ pepys facts

 rules repo (git): pools, pipelines, gates, experiments, plug-in versions
              │ merged commit + concept pins = rules version
              └──▶ boxxy store loads it; every decision records it
```

| Part | What it does | Owning doc |
| --- | --- | --- |
| boxxy store | One SQLite file behind one command API. It holds items, links, asks, attempts and leases, and runs `claimNext` inside its write transaction. | [dispatch](./dispatch.md) |
| planning core | `buildFrame()` runs the planning plug-ins over the facts; `decide()` reads the frame and the pools and returns picks. | [planning](./planning.md) |
| runner | Calls `claimNext`, resolves the recipe, starts the attempt through a worker kind, and settles its outcome. | [dispatch](./dispatch.md) |
| workers | A worker kind starts an attempt and reconciles it after a crash. atc runs agent sessions; a job runs a merge with no session ([review, verify and merge](./review-and-merge.md#job-attempts)); `script` runs deterministic steps. | [core model](./core-model.md#workers) |
| pepys | The fact log and every read table. A new view is a new query or consumer in pepys, not a table in the boxxy store. | [measurement](./measurement.md) |
| rules repo | Policy in git. The rules version hashes the commit, the files the loader read and the concept pins. | [rules](./rules.md#the-rules-version) |
| telemetry | Agent CLIs send OpenTelemetry logs and metrics. Each request record joins to its attempt. | [measurement](./measurement.md) |

### The boxxy store and pepys

The boxxy store exists because dispatch needs an atomic claim, and pepys has no compare-and-set
write. pepys orders facts only within one stream, while a claim is a policy decision over boxxy's
own state, so pepys never claims ([decision 0001](../../decisions/0001-claims-live-in-the-boxxy-store.md)).

Every change in the boxxy store ships to pepys as a fact through an outbox, written in the same
transaction as the change. pepys then holds the full history, and boxxy keeps only the state that
dispatch needs. Derived state, such as an item's state, is computed in both places. A test compares
the two, because they must agree.

A standby process on the same store file is a planned follow-up, so that one dead process does not
stop dispatch.

### Runners

The server app holds the boxxy store, the command API and a runner loop. Each machine that hosts
workers runs one runner. A runner on another machine reaches `claimNext` only through the command
API, because the store is one local SQLite file (inferred from the one-file store; not yet
stated as a decision).

### Workers and atc

A runner never calls an agent CLI directly. It calls a worker kind, and the `atc.session` worker
kind calls atc, which owns the session and its target (a local terminal or an imp). atc gives
idempotent spawn, fleet control, attention and an event trail. The two layers and their
capabilities are in [core model](./core-model.md#workers).

### Telemetry

Claude Code and Codex send OpenTelemetry logs and metrics to a local OTLP receiver, and pepys ingests
them as facts ([decision 0007](../../decisions/0007-spend-capture-through-otel.md)). Hooks carry the
work events that OTel lacks, such as tool use, subagents and compaction, and join to OTel on the
session id.

atc's own agent config switches telemetry on per agent, and the spawn request carries no telemetry
settings. boxxy joins each request record to its attempt by the agent session id: the record's
`session.id` matches an id that atc reports and boxxy records with the attempt. An attempt can
collect more than one agent session, such as when atc respawns its session. boxxy spawns each
session, so the attempt row gives the item, phase, recipe and capacity source. Prompt and
response text stay redacted, which is the OTel default. [Measurement](./measurement.md) owns the
capture details.

## Principles

1. **The core stays generic.** The core is items, phases, attempts, facts and plug-in kinds. A
   specific need goes into data, a rules line or a plug-in, never a special case in core code
   ([decision 0005](../../decisions/0005-the-core-stays-generic.md)). The measure (proposed) is core
   churn: the share of new needs that changed core code, plus boxxy's own upkeep in items and
   attempts per week. When a rule needs conditionals or loops, it becomes a typed plug-in, so the
   rules files never grow into a programming language.
2. **No permanent agent role sessions.** Triage, design, build, review, release and QA are phases of
   an item. Each phase runs as one attempt and then stops
   ([decision 0002](../../decisions/0002-one-attempt-per-phase.md)).
3. **Code decides what runs next, where a rule exists.** An agent does the work of a phase. Routing,
   claims, ordering and when to ask the owner are rules held as data. Where no rule exists yet, a
   recorded judgement phase decides, and a pattern in its decisions becomes a rule.
4. **State is derived, never typed.** Nobody sets a status. An item's state comes from its links,
   attempts, asks and outside facts.
5. **Every decision is reproducible.** `decide(state at T, rules version V)` is a pure function, and
   everything it reads is a fact. Time is an argument: only the apps read the clock, and each module
   gets the time it needs from its caller.
6. **One write path per fact.** Each fact has one function that writes it, and every flow that sees
   the fact calls that function. A fact written from only some flows leaves gaps that no query can
   detect ([decision 0013](../../decisions/0013-one-write-path-per-fact.md)).
7. **The owner is asked only for judgement.** One typed action per ask, and one ask at a time.
8. **Capture structured data, not transcripts.** OTel and hooks come first; transcripts are a
   fallback.

### Bending without breaking

A fixed rule can be wrong. These guards stop a wrong rule from blocking work:

- No matching rule never leaves work stuck. It escalates to a judgement phase, then to the owner.
- `core.task` is a free-form item kind with a minimal pipeline, for work that fits no other kind.
- The owner can start any agent on any item outside its pipeline. That manual attempt is still
  recorded and measured.
- Rules are cheap to change and safe to try: they are data, versioned, and replayed against past
  weeks before they go live ([rules](./rules.md)).
- Facts never change, so replay rebuilds a wrong read table or query. The write side is the costly
  place to be wrong, so it stays small.

## Style

- **Hexagonal.** The core (items, `buildFrame()`, `decide()`, settle rules) is pure. Driving
  adapters are the entry points (CLI, MCP, nixie, hooks) on one command port. Driven adapters sit
  behind ports: the store, the fact sources, the worker kinds and the ask channels. The clock is not a
  port: only the apps read it, and modules get time as an argument ([layout](./layout.md#import-pins)).
- **Strategies.** Each plug-in kind is a strategy interface: signal, gate, pool gate, waiver,
  admission, view, a worker kind's `reconcile`, and a phase's settle rule. A planning concept is a bundle of
  strategies ([decision 0004](../../decisions/0004-planning-concepts-are-plug-ins.md)).
- **Champion and challenger.** Rule sets and recipes each have a champion and challengers. Dispatch
  rules run challengers in shadow; recipes run them in live buckets
  ([measurement](./measurement.md)).

[Layout](./layout.md) maps these parts to packages, and pins each outside system to one adapter
package.
