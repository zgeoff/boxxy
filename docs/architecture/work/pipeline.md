# The work pipeline

boxxy takes an item of work through a pipeline of phases, such as triage, design, build and review.
A phase can take several attempts. Most attempts run an agent session, and a merge runs as a job
that the runner drives. The pipeline is data in the rules file: the phases, the edge each outcome
takes, and the limits on attempts and rounds. boxxy stores no position for an item: it works out
where the item stands from the item's settled attempts each time it reads the item. When an outcome
needs the owner, the item holds, and the owner gets a notice.

[The overview](../overview.md#terms) defines the terms this doc uses, such as attempt, close-out,
settle, hold, runner, seat, pool, recipe and atc. [Attempt lifecycle](./attempts.md) covers one
attempt, [Agent sessions](./sessions.md) the kept session and capacity, and [Notices](./notices.md)
how a notice reaches the owner. The design doc
[Review, verify and merge](../../design/boxxy/review-and-merge.md) owns the steps after a build.

## The pipeline

The example rules file, `modules/rules/example/rules.yaml`, has one pipeline with four phases:

```mermaid
flowchart LR
  triage -->|accepted| design
  triage -->|"duplicate, declined, needs-owner"| hold(["hold for the owner"])
  triage -->|split| split(["end: split"])
  design -->|designed| build
  design -->|blocked| hold
  build -->|built| review
  build -->|blocked| hold
  review -->|passed| reviewed(["end: reviewed"])
  review -->|"changes-requested, 3 times at most"| build
  review -->|"failed: once more"| review
```

The rules file lists a pipeline's steps, one per phase, in order. A step gives its phase, the
attempts it allows in a row (`maxAttempts`), a time limit (`timeoutMinutes`) and an edge for every
outcome. The phase kind, the server's code for a phase, lists the outcomes, parses the close-out and
sets the worker kind that runs its attempts: `atc.session` for an agent session
([the atc worker](./sessions.md#the-atc-worker)), or `merge.forge` for a merge job. An edge is one
of five kinds:

- `next` moves the item to the step after this one, or ends the pipeline after the last step.
- `again` runs the same phase again, and counts against the step's `maxAttempts`.
- `{ to, max, resume }` moves the item to the step of phase `to`, and adds 1 to the item's
  [round](#rules-of-the-engine). An edge to an earlier step, or to its own step, is backward. A
  backward edge needs `max`, the times the edge may run before the item holds with `rounds used up`,
  so every loop ends. `resume: true` wakes the target's
  [kept session](./sessions.md#the-kept-session), and only a backward edge takes it.
- `{ end }` ends the pipeline with a reason.
- `{ hold }` holds the item for the owner with a reason.

A close-out can ask for changes, such as closing the item, filing new items or adding relations.
When the outcome's edge is a hold, [settle](./attempts.md#settle) files the new items and withholds
every change to the item itself, so the owner decides first. Settle keeps one change: a `blocks`
relation from another item to this one, so a blocked design or build still waits on that item after
the retry.

### Rules of the engine

- **The position is a fold.** boxxy replays, in time order, the item's settled attempts and each
  `boxxy item retry` the owner ran, under the rules loaded now, from each attempt's stored outcome
  and round.
- **Every outcome has an edge.** The loader refuses a step that leaves out an outcome of its phase
  kind, or adds one the phase kind lacks. A stored outcome can still lose its edge when a newer
  phase kind drops it. The engine then holds the item with `outcome not in rules`, and never moves
  it on as `next`, so no item skips a phase unchecked.
- **Two outcomes come from the engine.** `lost` is the outcome of a failed attempt with no outcome
  of its phase: no valid close-out, or a forced failure such as `skill-missing`
  ([the failures](./attempts.md#settle)). `lost` acts as `again`, except that the engine skips a
  `no-capacity` or `usage-limit` failure, since the work never ran. `unsettleable`, a close-out the
  phase code could not settle, has no edge, so it holds the item with `outcome not in rules`.
- **The round belongs to the item.** It starts at 1 and rises with each `{ to }` edge, each
  `boxxy item retry --phase`, and each `boxxy item retry` that lifts a `rounds used up` hold. The
  review of a reworked build has the build's round.
- **Three holds come from the engine:** `attempts used up`, `rounds used up` and
  `outcome not in rules`. The loader refuses a `{ hold }` edge with one of these reasons, so a
  report can tell an engine hold from a rules hold.
- **`boxxy item retry <item>` lifts a hold.** It restarts both counts: the attempts in a row, and
  the runs of each `{ to }` edge. With `--phase <phase>` it also moves the item to that phase, which
  is the only way back to build after a passed review.

The loader also refuses a step with no time limit, and a phase kind on a worker kind this server
lacks. A server builds `merge.forge` only when its config has a `github` section.

### A rules change

A rules change never touches a live attempt: the attempt settles by the phase kind loaded when it
settles. boxxy derives an item's position on every read, so an item between attempts stands where
the new rules put it. After the change, an item can stand at another phase, leave a hold because a
`maxAttempts` or `max` went up, or take a hold because one went down. The owner gets no notice for
such a hold, because boxxy writes notices only at settle. Run `boxxy rules dry-run <file>` before a
rules change merges. It prints each open item's position now and under the new rules, and writes
nothing.

## Design mode

An item's design runs in `agent` mode by default. In `attended` mode the owner works with the agent
in the session, and the agent sends its close-out when the owner is done. The owner sets
`designMode` with `boxxy item file` or `boxxy item edit`, or a triage close-out sets it. An attended
design starts and takes its seats even when the owner is away. Its session then sleeps after
`sleep.afterUnattendedMinutes` with no owner attached, and gives its seats back.

## Limits and pools

A limit caps the attempts that run at once. It has a name, a maximum, and a filter on the phase and
the item's fields that picks the attempts it counts. The claim starts an attempt only when every
limit that counts it has a free seat. A sleeping attempt gives its seats back. The example has two
limits: `workers` counts every attempt, and `owner-design` counts attended designs. `workers` is an
upper bound only: the atc target that sessions run on (`spawn.target` in the server config) can have
fewer free machines, and atc then refuses the session
([capacity](./sessions.md#capacity-and-the-usage-limit)).

A pool picks which ready item the claim takes next: it takes the items that match its filter, in its
order, and the owner's levers, such as expedite and defer, change that order. A pool sets no count,
so the loader refuses a pool unless some limit counts every attempt the pool can start.

## Recipes and skills

Each item has a kind, such as `core.issue`. The `kinds` section of the rules file gives each kind
its pipeline and a recipe for each phase, keyed by the phase name. The key `design/attended` gives
the recipe for a design in attended mode.

The review recipe runs on a review agent, an atc agent set up with a read-only token for cloning the
repo. When the server config lists review agents in `spawn.reviewAgents`, the loader keeps review
agents to review sessions and review sessions to fresh starts. It refuses a review agent in any
other phase's recipe, and a review recipe on any other agent. It also refuses a review recipe with
`session: builder` and a `resume: true` edge to review, because either could leave a review agent's
session kept for the next build to wake. With an empty list, the default, it checks none of this.

- **Skills are pinned.** The rules file's `skills` section pins one commit of one skills repository,
  and each recipe lists the skills its phase needs. Each attempt records a hash of its recipe, its
  prompt templates, the rules version and the pin, so pepys keeps apart attempts of a changed
  recipe.
- **The session-start hook fetches the skills** at the pin into the session's workspace. A skill it
  could not install fails the attempt as `skill-missing`.
  [Installing skills](../interfaces/cli-and-hooks.md#installing-skills) covers the fetch.
- **A build recipe has no check command.** The agent follows the repo's own agent instructions, so
  each repo keeps its own checks.

### The launch prompt

A session reads its whole task in its launch prompt, which the server renders at claim from the
recipe's [Liquid](https://liquidjs.com/) template with `@boxxy/prompt-template`. Each placeholder
gives its content only, with no heading. `ticket` is the exception: it gives the whole item, with a
heading on each section. `design`, `conclusion`, `findings` and `stopped` come from the attempt's
input, which the phase kind builds at claim from the item's earlier attempts. A template author
needs these rules:

- **Each value is plain text, and an empty section is the empty string**, which `{% if name %}`
  reads as false. Write each section's heading inside an `if` block. Open the tag with `{%-`, so an
  empty section leaves no blank line.
- **A value reaches the agent as written.** Liquid never parses a value again, so a value that
  contains `{{ }}` or `{% %}` stays text.
- **A template the loader accepts renders at claim with any values.** The loader refuses the rules
  as `bad-prompt` for a template that could throw at claim, such as one that binds a name in a
  branch that might not run.
- **A `for` loop over a placeholder yields the whole value once**, or never for an empty value.

| Placeholder           | Value                                                                                                                                                                      |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`, `repo`       | the item's title and repo                                                                                                                                                  |
| `outcome`             | the outcome the owner wants from the item, as filed                                                                                                                        |
| `body`                | the item's body as the owner wrote it                                                                                                                                      |
| `acceptance`          | one `- <id>: <text>` line for each criterion                                                                                                                               |
| `design`              | the design text, then `Location: <location>` when the design has one. Only a build gets it.                                                                                |
| `conclusion`          | the `conclusion` of the latest design, such as the result of an investigation. Only a build gets it.                                                                       |
| `findings`            | what sent the build back: a review ([the review](#the-review)), or a verify ([the verifier](../../design/boxxy/review-and-merge.md#the-verifier)). Only a build gets it.   |
| `stopped`             | where the latest attempt of the same phase stopped: the question of a `needs-owner` triage, or the reason of a `blocked` design or build. Empty after any other close-out. |
| `notes`               | one `- <YYYY-MM-DD>: <text>` line for each note, oldest first                                                                                                              |
| `security`            | `true` when the item has the [security mark](#the-ledger-labels-notes-and-relations), and empty otherwise                                                                  |
| `ticket`              | the whole item: `# <title>`, the outcome, the body, then each section that has content under its own heading. It leaves out `security`.                                    |
| `attempt_id`, `input` | the attempt's ID, and its input as JSON                                                                                                                                    |

A recipe may name a second template in `reworkPrompt`. The claim renders it in place of `prompt`
when an earlier attempt of the same phase succeeded for the item, such as a build that a review sent
back. When the item has a [kept session](./sessions.md#the-kept-session), the claim wakes it with
the rendered prompt, so the agent gets the new findings. Otherwise it starts a fresh session with
the rework prompt, so that template must carry the whole task, such as with `{{ ticket }}`.

## The ledger: labels, notes and relations

boxxy is the only record of the work. Each fact carries in full the text it changes: the title, the
outcome, the body, the acceptance list, the labels, each note and each relation. pepys can therefore
rebuild every item from the facts alone ([facts and pepys](../interfaces/facts-and-pepys.md)). A
fact never links to an outside tracker.

- **The body** is markdown up to `itemBodyMaxChars`: the context, scope, permissions and notes for
  the agent. boxxy never parses it. `boxxy item edit` and a triage close-out's `set.body` replace
  the whole text.
- **Labels** are free short strings. `boxxy item edit` replaces the whole list.
- **The security mark**, `fields.security: true`, marks work on a security weakness. The owner sets
  it with `boxxy item file` or `boxxy item edit`, and a close-out can set it on an item it files
  ([close-outs](../../design/boxxy/close-outs.md#openitems)). Only a template reads the mark,
  through the `security` placeholder.
- **Notes** are append-only. Every later launch prompt carries them in `{{ notes }}`.
- **Relations** have types that are rules data, such as `blocks`, `duplicate-of` and `relates-to`.
  `boxxy item close <item> --of <other>` closes the item as a duplicate and adds a `duplicate-of`
  relation in the same change.

## Notices

The settle that leaves an item on hold writes a notice, and the runner sends it to the owner. An
agent's question takes the same path. The agent closes out `blocked` with the question, or
`needs-owner` at triage, and the item holds. The owner reads the question with `boxxy item show`,
answers with `boxxy item note`, and runs `boxxy item retry`. The next attempt of the phase gets the
question in `{{ stopped }}` and the answer in `{{ notes }}`. That attempt sees nothing else of the
last one's work, so the example prompts tell a blocked agent to put its progress in the reason too.

## The review

[The review gate](../../design/boxxy/review-and-merge.md#the-review-gate) owns the review. A review
session runs the one command that the gate builds for the review tool, and sends the tool's raw
result as its close-out. The server checks that the result covers the pull request's head commit,
then posts the result to the pull request. A failed call, or a result for another commit, settles
`failed`.

The next build's `findings` gives the commit the review read, the open findings counted by severity,
and the review gate's text on how to answer them, never the findings' text
([decision 0009](../../decisions/0009-close-outs-hold-what-only-the-agent-knows.md)). After a failed
verify, `findings` gives the commit the verify ran at and the failed features.

## Derived item state

boxxy derives an item's state on every read, from its position, attempts, acceptance list, pull
requests and relations. The
[pull request hook](../interfaces/cli-and-hooks.md#the-pull-request-hook) or
[the watch](../interfaces/github.md#the-pull-request-watch) links a pull request to an attempt. The
first match wins:

| State      | When                                                                                                                                                           |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `archived` | the item is closed                                                                                                                                             |
| `held`     | the owner filed the item held, and `boxxy item release` has not released it                                                                                    |
| `running`  | the item has a live attempt, a sleeping or closing one included                                                                                                |
| `waiting`  | the position is a hold, with the hold's reason                                                                                                                 |
| `done`     | the position is an end, and a pull request linked to a succeeded build attempt has merged                                                                      |
| `waiting`  | the position is an end, and no linked pull request has merged, with the reason `pull request open`, `no pull request linked` or `pull request closed unmerged` |
| `idea`     | the phase needs an acceptance list and the item has none                                                                                                       |
| `blocked`  | an item that `blocks` this one is neither done nor archived                                                                                                    |
| `ready`    | any other case                                                                                                                                                 |

`boxxy item release` starts a `held` item at triage. The `blocked` state means another item blocks
this one, and the `blocked` outcome makes the item `waiting`. Build, review, verify and merge need
an acceptance list. An `accepted` triage must leave one, and a `designed` close-out may replace it.
The claim never starts an `idea` item until the owner adds a list with `boxxy item edit`, or runs
`boxxy item retry --phase design`.

Once the position is an end, the state reads the pull request's merge, never a merge phase's
outcome, so a merge by hand and one by boxxy both make the item `done`. An item on hold stays
`waiting` even when its pull request merges. When the pull request closed unmerged, the owner runs
`boxxy item retry <item> --phase build` or closes the item.
