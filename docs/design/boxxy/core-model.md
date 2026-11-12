# Core model

boxxy's core has five nouns: items, links, phases, attempts and asks. An item is a typed piece of
work. Its kind declares a pipeline of phases as data. Each phase runs as one attempt through a
worker, and the attempt ends with a typed close-out. Nobody sets an item's state: boxxy derives it
from links, attempts, asks and outside facts. Every entry point reaches this model through one
command API.

## Items

An item is a typed node. Its kind comes from the item kind registry, and the core names only the
`core.*` kinds:

| Kind | Holds |
| --- | --- |
| `core.issue` | a piece of work to build |
| `core.idea` | a thought not yet triaged |
| `core.finding` | a review finding, linked `found-in` to the item it was found in |
| `core.decision` | a choice that freezes when done |
| `core.prevention` | a change that stops a class of finding from recurring |
| `core.task` | free-form work with a minimal pipeline, for work that fits no other kind |

[Planning](./planning.md) adds `core.project` and `core.goal`. A new kind is a registry entry with
its pipeline and typed fields, not new core code. Free tags are refused: a kind declares typed
fields, such as `trigger`, `area` and `size`.

### Derived states

An item's state is one of `idea`, `ready`, `running`, `blocked`, `waiting`, `done` or `archived`.
boxxy computes it from facts each time, and no command sets it.

- `item.close` with a reason archives an idea. Nothing is deleted, and archived items stay
  queryable.
- A `core.decision` item freezes when it is done. To change course, file a new decision that
  `supersedes` the old one.
- A late outcome, such as a revert five days after merge, attaches to the attempt as a new fact.
  Whether it reopens the item is a rule.

## Links

Links are typed, and the link types are a registry like the item kinds.

| Link | Meaning |
| --- | --- |
| `blocks` | the target can't be ready until the source is done |
| `parent` | one item is a part of the other |
| `supersedes` | the source replaces the target, usually a decision |
| `found-in` | the source was found while working on the target |
| `designs` | the source is the design for the target |
| `prevents` | the source stops a class of finding |
| `relies-on` | the source rests on a decision |
| `serves` | the source contributes to a project or goal ([planning](./planning.md)) |

Readiness reads only the blocking link types, such as `blocks`. The other types never hold an item.
`relies-on` makes two questions into queries: why something is built the way it is, and what rested
on a decision that has since been superseded.

## Phases

A phase defines what one attempt is for, what input it needs, which worker kind runs it, and what its
outcome does to the item. Phases come in four shapes:

1. **Pipeline phases** are the steps of a kind's pipeline, such as triage, then design only when
   triage asks for it, then build, review, release and QA.
2. **Triggered phases** start from any state when a fact matches an `on:` condition, then hand back.
   Rebase, conflict resolution and a CI fix are triggered phases ([merge train](./merge-train.md)).
3. **Attended phases** have the owner in the session, such as a design chat. Runners never claim
   them. They are still attempts, with a recipe, measured spend and a typed close-out.
4. **Script first, agent on failure** phases run a `script` attempt, and start an agent attempt only
   on the outcomes the script can't handle.

### Pipelines as data

A kind declares its pipeline in the rules repo: the phases in order, with `when`, `repeatUntil` and
`maxAttempts` per step. A new shape of work is a new pipeline, not new dispatcher code. A pipeline
can apply per kind, per project or per item (`item.edit pipeline=<name>`), so a new pipeline can be
tried on a few items and measured against items without it.

### Gates and sign-offs

A sign-off is a gate phase: an ask whose answer is the phase's outcome. This pipeline signs off an
interface before anyone designs against it:

```yaml
pipelines:
  contract-first:
    - contract   # an agent sketches the interfaces; the close-out files a draft core.decision
    - sign-off   # gate: an ask bound to the draft's hash; approval freezes the decision
    - design     # input: the frozen decision, linked relies-on
    - build
    - review
```

- `claimNext` enforces the gate: nobody can claim `design` until a sign-off fact exists for the exact
  draft hash. A changed draft needs a new sign-off.
- A rejection sends the item back to `contract`, with the reason as input.
- A rule on the gate sets who may sign off, and whether the owner's override can skip it.
- Time spent waiting at a gate counts as a cost of the pipeline (proposed).

## Attempts

One attempt is one run of one phase on one item ([decision 0002](../../decisions/0002-one-attempt-per-phase.md)).
An attempt records:

- **Its recipe.** The recipe is what the attempt ran with: agent, model, effort, prompt template,
  skills with their pinned commit, instruction files, rules version and experiment arm. It is content-addressed, so
  each recipe hash resolves to the exact material that ran.
- **Its claim.** A lease row in the boxxy store, guarded by a generation number
  ([dispatch](./dispatch.md)).
- **The exact spawn request.** boxxy stores it with the claim, so a retry after an unclear spawn
  sends the original payload. atc checks the payload hash.
- **Its basis.** The item fields, the decisions it relies on, its recipe and its read positions at
  start ([changes while an attempt runs](#changes-while-an-attempt-runs)).
- **Its close-out.** A typed outcome per phase kind. An attempt whose close-out doesn't parse fails
  ([close-outs](./close-outs.md)).
- **Its commits and PRs.** boxxy links them from evidence, never by guess
  ([close-outs](./close-outs.md#linking-attempts-to-commits-and-prs)).

The attempt's record never changes. Late outcomes, such as a revert, a follow-up fix, an escaped
defect or a review reply, attach as new facts. A crash or an unknown spawn result puts the attempt in
`reconciling`, which [dispatch](./dispatch.md#unknown-outcomes) settles.

## Changes while an attempt runs

A relevant fact can land while an attempt is in flight: an answered ask, a superseded decision the
item relies on, a steer, a rank or expedite, a drop, a moved base branch, or a confirmed finding.
When one lands, a rule picks one response:

| Response | What happens |
| --- | --- |
| notify | the default: an atc message to the running session, as a steer |
| restart | boxxy stops the attempt and starts a new one from the new state |
| cancel | boxxy stops the attempt, because the item was dropped or superseded |
| ignore | the attempt finishes, and its outcome is marked as built on a stale basis |

boxxy never stops an attempt silently. Each response is a fact, so the cost of mid-flight changes is
a query, and review can see work that was built against a superseded decision.

## Workers

Two interface layers sit under a runner, and neither reaches through the other:

```text
 runner
   └─ worker kind: atc.session · noslop.cli · script · another vendor later
        └─ atc.session uses atc's target providers: local-pty · imp · others later
             └─ capabilities flow up: suspend, resume, memory, network
```

- A worker kind owns `start` and `reconcile`, and declares what a runner must offer to host it.
- What a session does while it waits on an ask depends on its capabilities. An imp suspends and
  wakes where it left off. A local session stops, and resumes from its transcript later.

## Entry points

Every entry point is a client of one command API: `item.file`, `item.edit`, `relation.add`,
`item.close`, `steer`, `ask.answer` and the others. Entry points include the owner's own Claude Code
session through a mod, the CLI, agents filing work, and later nixie.

- **The actor comes from the listener a call arrives on**
  ([API and auth](./v1-api-and-auth.md#the-two-paths)). A call on the owner listener with no token
  acts as the owner. A call with the worker token acts as a session, and its proven caller names
  the session. The actor never comes from a value the caller supplies, such as an environment
  variable.
- **The owner's path is the only check on an owner command.** Any caller on that path can expedite,
  file or rank, and boxxy never asks for a confirmation bound to the person
  ([API and auth](./v1-api-and-auth.md#the-two-paths)).
- An agent inside an attempt files work as that attempt, and the new item links `found-in` to it.
- A steer reaches a running attempt as an atc message, and the next attempt through its input.

## Asks and grants

- An ask carries one exact action, bound by its hash, and the cause that opened it.
- Asks queue, and the owner sees one at a time. An ask withdraws itself when its `closesWhen`
  condition holds.
- An "always allow" answer becomes a grant: a rule the owner can read. Every act under a grant is
  logged with the grant's id and version. A grant binds an exact action, never a category of ask.
- Quiet hours belong to the ask channel's availability.
- An operational gap, such as an uncertain spawn, goes to reconcile, never to the owner.
