# Close-outs

A close-out is the typed outcome an agent writes when its attempt ends. The agent writes only what
only it knows ([decision 0009](../../decisions/0009-close-outs-hold-what-only-the-agent-knows.md)).
boxxy derives everything else, such as commits, PRs, CI results, findings, tokens and time, from
facts. Each phase kind brings its own close-out type, and an attempt whose close-out doesn't parse
fails. The close-out has no free-text `learnings` or `intent` field.

## The build close-out

The field names and the friction targets are decided. The shape inside each field is proposed.

```ts
type BuildCloseOut = {
  result: BuildResult;
  criteria: CriterionEvidence[];
  openItems: OpenItem[];
  friction: Friction[];
};

type BuildResult =
  | { kind: "built" }
  | { kind: "blocked"; reason: string }
  | { kind: "abandoned"; reason: string };

type CriterionEvidence = {
  criterion: CriterionId; // one entry in the item's acceptance list
  evidence: FactId; // the fact that shows the criterion holds
};

type OpenItem = {
  kind: ItemKind;
  title: string;
  body: string;
};

type Friction = {
  target: { kind: "skill" | "rule" | "lint" | "agents-md" | "tool"; name: string };
  change: string; // what to change in the target
};
```

### result

`result` records how the attempt ended, from the agent's side. It never records a merge or a green
build: those are facts that boxxy reads from the forge and CI.

### criteria

An item's acceptance is a typed list of criteria, each naming the evidence it needs, such as a PR, a
review result, a CI run, a release or a live check. The close-out links each criterion the agent met
to the fact that shows it. An item is done when every criterion has evidence. boxxy derives the
part-done states, such as "shipped, one step owed", from which criteria still lack evidence.

### openItems

Each open item is work the agent found and did not do. boxxy files it through dedupe: when an open
item matches an item already filed, boxxy links the existing item rather than filing a second one.
Each open item links `found-in` to the attempt that reported it.

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
| review | the review worker's own check result is the outcome ([merge train](./merge-train.md)) |

## Derived from facts

boxxy never asks the agent for these, because a fact records each one:

| What | Source fact |
| --- | --- |
| commits and PRs | the trailer and the PR hook ([below](#linking-attempts-to-commits-and-prs)) |
| CI results | GitHub check runs |
| review findings | noslop's review facts |
| tokens, cost and time | OTel request records stamped with the attempt ([measurement](./measurement.md)) |
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
