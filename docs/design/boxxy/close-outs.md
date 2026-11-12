# Close-outs

A close-out is the typed outcome an agent writes when its attempt ends. The agent writes only what
only it knows ([decision 0009](../../decisions/0009-close-outs-hold-what-only-the-agent-knows.md)).
boxxy derives everything else, such as commits, PRs, CI results, findings, tokens and time, from
facts. Each phase kind brings its own close-out type. boxxy rejects a close-out that doesn't parse,
and the attempt stays open for the agent to send it again. The close-out has no free-text `learnings` or `intent` field.

## The build close-out

The field names and the friction targets are decided. The shape inside each field is proposed.

[`06-closeouts.ts`](./sketches/06-closeouts.ts) holds the shape, `BuildCloseOut`, with four fields:
`result`, `criteria`, `openItems` and `friction`. The sections below give what each field holds.

### result

`result` records how the attempt ended, from the agent's side. It never records a merge or a green
build: those are facts that boxxy reads from the forge and CI.

### criteria

An item's acceptance is a typed list of criteria, each naming the evidence it needs, such as a PR, a
review result, a CI run, a release or a live check. The close-out links each criterion the agent met
to the fact that shows it. boxxy never reads this evidence to decide that an item is done
([derived item state](./v1.md#derived-item-state)).

### openItems

Each open item is work the agent found and did not do. boxxy files it through dedupe. When an open
item matches an open item already filed, boxxy files nothing and links the existing item to the
attempt: in slice 1, the attempt's settle fact lists it. An item filed from an open item records
the attempt that reported it as `found-in`
([slice 1](./slice-1.md#the-build-close-out)).

### friction

Each friction entry has a target: a skill, a rule, a lint, an `AGENTS.md` file or a tool. boxxy
turns it into a proposal against that target. boxxy drops a friction entry with no target, because a
complaint with nowhere to go becomes backlog that nobody acts on.

## Other phase kinds

Each phase kind declares its own close-out type in the registry ([rules](./rules.md)). These
constraints apply to the kinds the design names:

| Phase kind | Close-out constraint |
| --- | --- |
| triage | carries a typed `size`, which cohort keys and the [forecast](./planning.md#forecast-proposed) read |
| contract | files a draft `core.decision` for the [sign-off gate](./core-model.md#gates-and-sign-offs) |
| `plan.judge` | ends the strand with an override (pin, admit or lift) or a defer ([planning](./planning.md#the-judgement-pool)) |
| review | the review worker's own check result is the outcome ([merge train](./merge-train.md)); in v1 the review session sends the verdict and the findings as text ([v1](./v1.md#the-review)) |

## The v1 phase kinds

`modules/closeout/src/phases/` holds the four phase kinds of [v1](./v1.md#the-pipeline): `triage`, `design`, `build` and `review`, and `phaseKinds` lists them for the rules loader. `libs/model/src/closeouts/types.ts` holds each close-out body and each input.

Each parser runs these steps, and a failed step returns every problem it found and skips the steps after it:

1. Drop each friction entry with no target, and count it in `frictionDropped`. boxxy ignores a count the agent sends.
2. Check the body against the phase's schema. Every schema problem comes back, with its path in the body as sent.
3. Build the stored body, and check the phase's rules, such as `no-acceptance`.
4. Measure the stored body. One over 120,000 bytes is `too-large`, so the `closed_out` fact always fits one outbox item. `closeOutLimits` in `modules/closeout/src/close-out-limits.ts` holds both byte limits.

The parser cuts no list. A cut finding or open item would be work lost with no count, and the byte limit already bounds the fact. Each parser also gives `jsonSchema`, the JSON Schema of the body the agent sends, which `attempt.current` passes to the session.

| Phase | The parser refuses | The settle |
| --- | --- | --- |
| triage | `accepted` that leaves the item with no acceptance list; an unknown item, kind or relation type; a relation to the item itself; a relation named twice, counting the `duplicate-of` relation of a `duplicate` | succeeded. Asks to set the kind, the design mode and the acceptance list, numbered from `a1`, to add each relation, and to close a `duplicate` or `declined` item |
| design | nothing past the schema | `designed`: succeeded. `blocked`, `abandoned`: failed, with the outcome as the failure |
| build | a criterion the item lacks; evidence of another attempt; `built` with a criterion that has no evidence | as design. Asks to file each open item, and, when `built`, to add the cited evidence to the acceptance list |
| review | `changes-requested` with no finding | succeeded |

A blocked or abandoned design or build fails, so it never reads as done work and no session is kept for it. Its failure is the outcome name. The engine reads some failure names, such as `no-capacity`, and the agent's free-text reason could match one, so the reason stays in the close-out. Every settle also asks to record each friction entry as a proposal. The settle returns the effects and the outcome, and the caller applies the effects. When the rules map the outcome to a hold, the caller withholds each effect that changes an item ([v1](./v1.md#the-pipeline)).

The review session sends noslop's whole result. The parser reads the version, the review ID, the head and the three lists it counts, and lets every other field through, so a newer noslop still parses. The stored close-out keeps `NoslopSummary`: the counts, the size of the result, and the result whole only when it is 32,768 bytes or smaller.

Each phase's input is the item's acceptance list. A build also gets the latest design, the findings of the latest review when it asked for changes, and the item's latest pull request. A review gets the latest design and the latest pull request. The notes of the item reach the session through `attempt.current`, beside the input.

## Derived from facts

boxxy never asks the agent for these, because a fact records each one:

| What | Source fact |
| --- | --- |
| commits and PRs | the trailer and the PR hook ([below](#linking-attempts-to-commits-and-prs)) |
| CI results | GitHub check runs |
| review findings | noslop's review facts; in v1, the review close-out |
| tokens, cost and time | OTel request records, joined to the attempt by the agent session id ([measurement](./measurement.md)) |
| changes the attempt saw | the notify, restart, cancel and ignore facts ([core model](./core-model.md#changes-while-an-attempt-runs)) |
| owner attention | atc's event trail |

Late outcomes, such as a revert or an escaped defect, attach to the attempt as new facts and never
change its close-out.

## Linking attempts to commits and PRs

Every outcome query, such as cost to land, survival, reverts or findings per recipe, depends on
knowing which attempt made which commit and PR. boxxy links them from evidence
([decision 0012](../../decisions/0012-link-attempts-by-trailer-and-hook.md)):

- **Commits carry a trailer** with the attempt id: `Boxxy-Attempt: <attempt_id>`. A trailer survives
  rebase, cherry-pick and squash (research), so the link survives the
  [merge train](./merge-train.md).
- **A PostToolUse hook records PRs.** When the hook sees `gh pr create`, it records the PR against
  the attempt, from the command's own output.

boxxy never links by time window or file overlap: matching sessions to commits by a time window and
shared files links the wrong session (research). A PR named in an atc session's scope doesn't prove
that the session opened it either.

How the trailer gets onto each commit is open. One candidate is a commit-message hook in the
attempt's workspace that reads the attempt id from the environment the worker set at spawn.
