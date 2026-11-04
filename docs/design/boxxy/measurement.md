# Measurement

boxxy measures what it costs to ship one change, split by phase, and tests changes to how it works
with live experiments. Spend comes in through OpenTelemetry, every other input is a fact in pepys,
and a pure `verdict()` turns the facts into a call that the owner approves or rejects. Metrics and
cohort keys are plug-ins; assignment, the noise floor and the stop rules stay fixed in the core.

The decisions behind this doc are
[0006: the measurement verdict with plug-in metrics](../../decisions/0006-measurement-verdict-with-plug-in-metrics.md)
and [0007: spend capture through OTel](../../decisions/0007-spend-capture-through-otel.md). The
`modules/measurement` package holds the code; [the layout](./layout.md) gives its place.

## Spend capture

Each attempt runs in an agent session that boxxy starts through atc (see [dispatch](./dispatch.md)).
The `worker-atc` adapter sets `OTEL_RESOURCE_ATTRIBUTES` on the session, so every request record the
agent sends carries these attributes beside its `model`. The stamp is the only join from a request
to its attempt. boxxy needs atc's `session.spawn` to accept telemetry attributes, which the
[slice 1 prerequisites](./slice-1.md#prerequisites-outside-boxxy) list.

| Attribute       | Value                                                        |
| --------------- | ------------------------------------------------------------ |
| item            | the item's id                                                |
| phase           | the phase the attempt runs                                   |
| attempt         | the attempt's id                                             |
| recipe          | the recipe's content hash                                    |
| capacity source | the source the router picked (see [capacity](./capacity.md)) |

- Claude Code sends logs and metrics over OTLP; its `claude_code.api_request` event gives the model,
  cost, input, output, cache read and cache write tokens, and the duration of each request. Codex
  sends logs; its `codex.sse_event` gives token counts per response.
- pepys ingests the OTLP logs as facts. Each event kind has its own fact identity: `request_id` for
  `api_request`, `tool_use_id` for a tool result, and the pair (session id, sequence) for an event
  with neither. pepys drops a fact whose id it has applied before, so two distinct events must never
  share an id.
- Hooks carry the work events that OTel lacks: tool use, subagents, compaction, stop and failure. No
  hook payload carries token usage. A query joins hook facts to OTel facts on the session id.
- Prompts and responses stay redacted, which is OTel's default in both agents.

**Total input counts the cache.** `input_tokens` excludes cached tokens, so total input is
`input_tokens + cache_read_tokens + cache_creation_tokens`. A spend query that sums `input_tokens`
alone undercounts.

One attempt uses several models: the main session, subagents, an advisor and a review model. The
resource attributes tie each request to its attempt whatever model served it, so spend splits by
phase and model with no transcript read.

## Experiments

An experiment is a rules file in the rules repo (see [rules](./rules.md)). It compares a champion
with one challenger on one phase:

```yaml
# experiments/design-phase-v1.yaml
experiment: design-phase-v1
type: live-bucket # or: shadow (dispatch rules)
phase: build
arms: { champion: 50, challenger: 50 }
challenger: { recipe: with-design-phase@3 }
cohort: [kind, repo, size] # cohort-key plug-ins, by name
metrics:
  primary: cost-to-land # metric plug-ins, by name
  guards: [revert-14d]
sample: { effect: 0.15, power: 0.8 } # the loader derives the minimum per arm and freezes it
stop: 2026-12-01
```

There are two experiment types:

- **Live buckets, for recipes.** When a claim commits, `hash(item id, experiment id) mod 100` picks
  the item's arm. The claim's own transaction writes an exposure fact that records the arm, and the
  arm becomes part of the attempt's recipe. Assignment is deterministic, so a replay gives the same
  arm.
- **Shadow, for dispatch rules.** Pools share slots, so two live rule sets would interfere: a
  challenger that takes a slot changes what the champion sees. After each claim commits, boxxy runs
  the challenger's `decide()` on the champion's snapshot, outside the write lock, and records what
  it would have picked. The challenger acts on nothing.

The loader derives the minimum sample per arm from the declared effect and power and the champion's
measured variance. It refuses an experiment whose sample can't be reached before its stop date. The
loader freezes the file's definition hash at the first exposure; a change after that needs a new
experiment id.

### What the loader rejects

- A metric or cohort-key name that no plug-in registers.
- Two live-bucket experiments on the same phase whose cohorts overlap.
- A `sample` block with no effect or no power.
- A change to the file of a running experiment.

## Plug-ins

Metrics and cohort keys are plug-ins. Adding one is one file plus its name in an experiment's
`metrics` or `cohort` list.

```ts
interface CohortKey {
  name: string;
  // The loader passes only facts recorded before the exposure fact.
  value(item: PreExposureView): string;
}

interface Metric {
  name: string;
  kind: 'cost' | 'time' | 'rate'; // picks the estimator: time uses Kaplan-Meier
  unit: 'usd' | 'tokens' | 'minutes' | 'ratio';
  observe(item: ItemFacts, at: AnalysisDate): Observation;
}

type Observation =
  | { state: 'done'; value: number }
  | { state: 'pending' } // counts toward the pending stop rule
  | { state: 'censored'; atLeast: number }; // time metrics only
```

A cohort key reads only facts recorded before exposure, such as the size set at triage. It never
reads the arm's own output, such as the lines its diff changed, because the arm could move the item
into another cell.

## Fixed in the core

Every experiment uses the same versions of these parts, and no experiment can swap them out:

- **Assignment and the exposure fact.**
- **One estimator per metric kind:** cost, time and rate. An estimator becomes a plug-in only when a
  metric needs one the core lacks.
- **The noise floor.** The core takes several pairs of champion slices, each as wide as the
  challenger's arm, and sets the floor to the largest gap between any pair. The floor is then
  measured at the challenger's sample size. This is an A/A test.
- **The stop rules**, below.
- **The two experiment types.**

These parts protect against fooling yourself, which is why an experiment file can't change them.

## The verdict

```ts
const v = verdict('design-phase-v1', { at: '2026-12-01' });
// v.status: "too-few" | "pending" | "early" | "no-call" | "challenger" | "champion"
// v.rows:   one per cohort cell, plus a post-stratified pooled row
// v.hash:   the owner's promote ask is bound to it
```

`verdict()` is a pure function of the experiment and an analysis date. boxxy keeps no verdict as
state: each call recomputes it from facts, and writes `verdict.json` and a report as output.

- `no-call`: the call is due, and no row clears.
- `challenger` or `champion`: a row clears, and the status gives the arm that won.

- A row clears only when its interval excludes 0 and the effect is larger than the noise floor.
- **Stop rules.** The verdict makes no call, and gives the reason, in three cases:
  - `too-few`: an arm is below its minimum sample. The row shows no effect.
  - `pending`: more than 5% of an arm is still pending at the analysis date.
  - `early`: the analysis date is before the declared stop date. Verdicts can be read at any time,
    but a call waits for the stop date, because daily reads inflate false wins.
- **No selection on outcome.** Every exposed item stays in its arm's denominator, finished or not.
  The verdict prints the pending and abandoned counts beside n, and counts the full spend of an
  abandoned item.
- **Time metrics use Kaplan-Meier.** Time to merge and survival treat unfinished and unmatured items
  as censored, never dropped or averaged early.
- **Cost is read at an analysis date.** Censoring fits time metrics only, because an unfinished
  item's cost is only a lower bound. The analysis date is set after the stop date, late enough that
  few exposed items are still unfinished.
- **Shadow verdicts** report pick agreement plus paired proxies on the same snapshots, such as the
  age of the picked item and idle slot-minutes. A shadow verdict claims no outcome metric, because
  the challenger's picks never ran.

## Promotion

Promotion is an owner ask bound to the verdict's hash (see [core model](./core-model.md) for asks).
Nothing promotes itself. The ask approves one exact verdict, so a verdict computed later needs a new
ask.

## Queries

Each query runs over pepys facts. These are proposed; the first slice builds only cost to land per
item, by model (see [slice 1](./slice-1.md)).

- **Spend:** by phase, recipe, model, capacity source, item kind, pool and outcome, and attended
  against unattended. Abandoned attempts count.
- **Cost to land:** total spend of every attempt on an item, from claim to merge.
- **Design effect:** items with a design phase against items without, on cost to land, attempts,
  findings, escapes and survival. An honest answer needs a live-bucket experiment, because design
  gets attached to hard work.
- **Finding recurrence:** by lens, rule and path, with fix cost, the recipes that produced the
  findings, and the rate before and after each prevention lands.
- **Owner minutes per shipped change:** owner time in attended phases, asks and atc messages, per
  item that reaches done.
- **Early outcomes:** a revert, reopen or follow-up bug within 14 days, reported beside 30-day
  survival. A merged change counts as surviving when it lasts 30 days with no revert, rewrite or
  escape.
- **Wait at a gate:** how long items wait at a sign-off or another gate phase, counted as a cost of
  that pipeline.
- **Core churn:** the share of new needs that changed core code instead of adding a plug-in or a
  rules line (see [architecture](./architecture.md)).
- **Upkeep:** items and attempts per week spent on boxxy itself, against hq's measured maintenance
  load of 26 to 30 issues a week.
- **Conflict cost per week:** from the conflict fact each train rebase writes (see
  [merge train](./merge-train.md)).

## First experiment

The first experiment is the model-swap eval in slice 2, which
[capacity](./capacity.md#the-model-swap-eval) describes. It runs on a first cut of the verdict: cost
to land as the only metric, one pooled row with no strata, a fixed analysis date and the A/A floor.
It has no shadow rules and no report beyond the verdict row. Guards and strata follow.

## Open questions

- **An always-valid sequential test.** One would let a verdict call before the stop date. The core
  has none yet, so every call waits for the stop date.
