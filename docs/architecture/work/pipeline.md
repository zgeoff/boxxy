# The work pipeline

boxxy takes an item of work through a pipeline of phases, such as triage, design, build and review.
Each phase runs as one attempt: an agent session for most phases, or a job that the runner drives
for a merge. The pipeline is rules data, so a rules file sets the phases, the edge each outcome
takes, and the limits on attempts and rounds. boxxy stores no position: it works out where an item
stands from the item's settled attempts every time it reads the item. When an outcome needs the
owner, the item holds, and the owner gets a notice.

[Attempt lifecycle](./attempts.md) covers one attempt, from claim to settle, and the kept session.
[Notices](./notices.md) covers how a notice reaches the owner. The design doc
[Review, verify and merge](../../design/boxxy/review-and-merge.md) owns the steps after a build.

## The pipeline

The example rules file in `modules/rules/example/` holds the common case, four phases:

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

A pipeline is a list of steps. Each step holds a phase, the attempts it allows in a row, a time
limit, and an edge for every outcome of its phase kind. In the example, every step allows 2 attempts
in a row, `abandoned` runs a design or a build again, a review that asks for changes wakes the
build's kept session, and each step's `timeoutMinutes` sets its time limit: longest for build, then
design, then review, and shortest for triage.

A rules file can add the verify and merge phase kinds after review, so an agent grades the work on
the real app and boxxy merges the pull request when every required check is green at its head.
[Review, verify and merge](../../design/boxxy/review-and-merge.md) shows that pipeline.

An edge is one of five kinds:

- `next` moves the item to the step after this one, or ends the pipeline after the last step.
- `again` runs the same phase again, and counts against the step's `maxAttempts`.
- `{ to, max, resume }` sends the item to another phase and raises the item's round. A backward edge
  needs `max`, and on one `resume: true` wakes the target's
  [kept session](./sessions.md#the-kept-session).
- `{ end }` ends the pipeline with a reason.
- `{ hold }` holds the item for the owner with a reason. boxxy then withholds every effect of the
  close-out that changes an existing item, except a `blocks` relation, so a blocked design or build
  still waits on the other item after the owner's retry.

### Rules of the engine

- **The position is a fold.** The engine folds over the item's settled attempts and its retry levers
  with the rules loaded now. A settled attempt stores its outcome and its round.
- **Every outcome has an edge.** A phase kind holds its outcome names in one list, and the loader
  refuses a step that leaves one out or adds one the phase kind lacks.
- **An outcome with no edge holds the item** with `outcome not in rules`, and never reads as `next`.
  Two outcomes belong to the engine and no phase kind lists them: `lost`, an attempt with no valid
  close-out or a forced failure, acts as `again`, and `unsettleable`, a close-out the phase code
  could not settle, has no edge.
- **The round belongs to the item.** It starts at 1 and rises with each `{ to }` edge, each
  `item retry --phase`, and a retry out of `rounds used up`. The review of a reworked build has the
  build's round.
- **Three holds come from the engine:** `attempts used up`, `rounds used up` and
  `outcome not in rules`. The loader refuses a `{ hold }` edge with one of them as its reason, so a
  report can tell an engine hold from a rules hold. `boxxy item retry <item>` lifts a hold and
  resets both counts, of attempts in a row and of send-backs. With `--phase` it also sets the
  position, which is the only way back to build after a passed review.
- **Two failures never count.** An attempt that failed with `no-capacity` or `usage-limit` moves no
  item and counts against no limit of attempts, because each says the platform had no room, not that
  the work failed.

The loader also refuses a backward edge with no `max` (an edge back to its own step is backward), a
step with no time limit, and a step whose phase kind runs on a worker the server did not build.
[The rules version](../../design/boxxy/rules.md#the-rules-version) covers each phase kind.

### A rules change

A rules change never touches a live attempt: the attempt settles by the phase kind loaded when it
settles. An item between attempts stands where the new rules put it, because boxxy derives the
position on every read. A changed edge therefore moves the item, a raised limit frees an item on
hold, and a lowered limit can hold one.

Run `boxxy rules dry-run <file>` before a rules change merges. It prints, for each open item, the
position it has and the position it would get, and writes nothing.

## Design mode

An item's design runs in one of two modes, `agent` or `attended`. The person who files the item, or
its triage attempt, sets `designMode`; the default is agent. In attended mode the owner works with
the agent in the session, and the agent sends its close-out when the owner is done. boxxy starts an
attended design session by one rule: the planner picked the item, and both limits have a free seat.
An owner who is away costs one session start for each attended item: the session asks its first
question, waits, sleeps and frees both seats.

## Limits and pools

The rules file caps running attempts with named limits. The example has two:

| Limit          | Maximum | Counts                   |
| -------------- | ------- | ------------------------ |
| `workers`      | 7       | every attempt            |
| `owner-design` | 1       | attended design attempts |

`workers` is an upper bound. The worker target can have fewer free machines, and it then refuses the
spawn ([capacity](./sessions.md#capacity-and-the-usage-limit)). A sleeping attempt holds no seat.

A pool is a filter and a sort, with no count, so the loader refuses one that no limit is sure to
count. The example has one pool per phase, plus one for attended designs.

## Recipes and skills

A recipe sets how a phase's session runs: the agent, the model and effort, the prompt template, and
the skills. Each item kind maps each phase to a recipe, and `design/attended` to an attended
design's recipe. The review recipe runs under a review agent, whose broker profile holds a read-only
clone token, and the loader refuses a review agent on any other step, so no other session gets the
token.

- **Skills are pinned.** The rules file pins one commit of the skills repo, each recipe lists the
  skills its phase needs, and the recipe hash covers the list and the pin.
- **The session-start hook fetches the skills** at the pin into the session's workspace, then binds
  the session. A listed skill that is missing after the fetch fails the attempt as `skill-missing`.
  [Installing skills](../interfaces/cli-and-hooks.md#installing-skills) covers how the fetch runs
  and what counts as missing.
- **A build recipe has no check command.** The agent follows the repo's own agent instructions, so
  each repo keeps its own checks.

### The launch prompt

A session reads its whole task in its launch prompt. The recipe's prompt template is a
[Liquid](https://liquidjs.com/) template, and the server renders it at claim.
`@boxxy/prompt-template` holds the engine and the lists of placeholders, tags and filters a template
may use. Each placeholder but `ticket` holds its content only, with no heading. A template author
needs these rules:

- **Each value is plain text, and an empty section is the empty string**, which `{% if name %}`
  reads as false. A template therefore writes each section's heading itself, inside an `if` block,
  so an empty section leaves no bare heading. Write `{%-` to drop the line break before the tag, so
  an empty section leaves no blank line either. The example prompts in
  `modules/rules/example/prompts/` show both.
- **A value reaches the agent as written.** Liquid never parses a value again, so a value that holds
  `{{ }}` or `{% %}` stays text. The engine reads no file and escapes no output.
- **A template the loader accepts renders at claim with any values.** The loader refuses the rules
  as `bad-prompt` when a template does not parse, uses a tag or filter off the list, uses a name
  that is no placeholder, reads a field or a name from a value (`design.text`, `[title]`), builds a
  range, or loops over anything but a bare placeholder. A tag that binds a name, such as `assign`,
  is off the list, because a name bound in a branch that did not run would throw at claim.
- **A `for` loop over a placeholder yields the whole value once**, or never for an empty value.

| Placeholder                | Value                                                                                                                                                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`, `outcome`, `repo` | the item's title, outcome and repo                                                                                                                                                                                                          |
| `body`                     | the item's body as the owner wrote it                                                                                                                                                                                                       |
| `acceptance`               | one `- <id>: <text>` line for each criterion                                                                                                                                                                                                |
| `design`                   | the design text, then `Location: <location>` when the design has one. Only a build gets it.                                                                                                                                                 |
| `conclusion`               | the `conclusion` of the latest design, such as the result of an investigation. Only a build gets it.                                                                                                                                        |
| `findings`                 | after a review that left findings open: one line with the review's head and its open counts by severity, then where to answer them. After a failed verify: one line with the verify's head, then the failed features. Only a build gets it. |
| `stopped`                  | where the latest attempt of the same phase stopped: the question of a `needs-owner` triage, or the reason of a `blocked` design or build. Empty after any other close-out.                                                                  |
| `notes`                    | one `- <YYYY-MM-DD>: <text>` line for each note, oldest first                                                                                                                                                                               |
| `security`                 | `true` when the item has the [security mark](#the-ledger-labels-notes-and-relations), and empty otherwise                                                                                                                                   |
| `ticket`                   | the whole item in one placeholder: `# <title>`, the outcome, the body, then each section that has content under its own heading. It leaves out `security`.                                                                                  |
| `attempt_id`, `input`      | the attempt's ID, and its input as JSON                                                                                                                                                                                                     |

A recipe may name a second template in `reworkPrompt`. The claim renders it in place of `prompt` for
a rework round: an attempt of a phase that already succeeded once for the item. A build that a
review, a verify or a merge sent back is one, and so is a build the owner retried after a build that
succeeded. The rework template must carry the whole task, such as with `{{ ticket }}`, because the
claim spawns a fresh session with it when the kept session is gone. The loader checks it as it
checks `prompt`. A rework round on the [kept session](./sessions.md#the-kept-session) sends the new
attempt's prompt, so `findings` and `design` carry that round's input.

In the example, `{{ input }}` gives the build its pull request and the review its command, and the
build prompt forbids attribution in commits and pull request text.

## The ledger: labels, notes and relations

boxxy is the only ledger of the work. Every text of an item is in a fact, in full: the title, the
outcome, the body, the acceptance list, the labels, each note and each relation. pepys can therefore
rebuild every item from the fact stream. No fact links to an outside tracker.

- **The body** is markdown of 40,000 characters or fewer, empty by default: the context, scope,
  permissions and notes for the agent. boxxy never parses it. `item.edit` and a triage close-out's
  `set.body` replace the whole text. The owner door refuses a file or an edit whose fact would pass
  the outbox's limit for one fact, as `FACT_TOO_LARGE`, so no fact is parked later.
- **Labels** are free short strings. `item.file` sets them, and `item.edit` replaces the whole list.
- **The security mark** is the typed field `fields.security: true`. It marks an item whose work
  concerns a security weakness. A close-out sets it on an item it files, with `security: true` on
  the open item ([close-outs](../../design/boxxy/close-outs.md#openitems)), and the owner sets it on
  `item.file` or `item.edit` and clears it on `item.edit`. boxxy changes nothing else for a marked
  item: a template branches on the `security` placeholder. The pool concept has no filter field for
  the mark, so no pool routes on it.
- **Notes** are append-only. Every later launch prompt carries them in `{{ notes }}`.
- **Relations** have types that are rules data, such as `blocks`, `duplicate-of` and `relates-to`.
  `item.close` with `--of` closes an item as a duplicate and adds the relation in the same change,
  unless that relation is live.

## Notices

The settle that leaves an item on hold writes a notice, which the runner sends to the owner. A hold
that a rules change makes gets no notice, because no settle writes one. [Notices](./notices.md) owns
how a notice is sent and retried.

An agent's question takes the same path. The agent closes out `blocked` with the question, or
`needs-owner` at triage, and the item holds. The owner gets the notice, answers with
`boxxy item note`, and runs `boxxy item retry`. The notice gives the hold reason only, and
`boxxy item get` shows the question in the attempt's close-out. The next attempt of the phase gets
the question in `{{ stopped }}` and the answer in `{{ notes }}`, so a design or a build that stops
puts the question and what it did so far in its reason.

## The review

[The review gate](../../design/boxxy/review-and-merge.md#the-review-gate) owns the review. A review
session runs the command that the review gate gives, and sends the tool's raw result. The server
reads and posts the result, and the next build gets the open counts and where to answer the
findings, never their text, as
[decision 0009](../../decisions/0009-close-outs-hold-what-only-the-agent-knows.md) sets. A failed
call, or a result that covers no head, settles `failed`. The review takes a `workers` seat.

An `accepted` triage close-out must leave the item with an acceptance list. A design starts without
one, and a `designed` close-out may replace it. An item that stands at build, review, verify or
merge with no acceptance list derives `idea`, and no attempt starts until the owner adds a list with
`boxxy item edit` or sends the item back to design with `boxxy item retry`.

## Derived item state

boxxy derives an item's state on every read, from its position and its rows. The first match wins:

| State               | When                                                                                                                                                                                                        |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `archived`          | the item is closed                                                                                                                                                                                          |
| `held`              | the owner filed the item held, and `boxxy item release` has not released it                                                                                                                                 |
| `running`           | the item has a live attempt, a sleeping or closing one included                                                                                                                                             |
| `waiting`           | the position is a hold, with the hold's reason                                                                                                                                                              |
| `done` or `waiting` | the position is an end: `done` when a pull request linked to a succeeded build attempt has merged, otherwise `waiting` with `pull request open`, `no pull request linked` or `pull request closed unmerged` |
| `idea`              | the phase needs an acceptance list and the item has none                                                                                                                                                    |
| `blocked`           | an item that `blocks` this one is neither done nor archived                                                                                                                                                 |
| `ready`             | any other case                                                                                                                                                                                              |

Once the position is an end, the state reads the merge of the pull request, never a merge phase's
outcome, so a merge by hand and one by boxxy both make the item `done`. An item on hold stays
`waiting` even when its pull request merges. Under the example, which ends at review, the item waits
with `pull request open` until someone merges it;
[the merge step](../../design/boxxy/review-and-merge.md#the-merge-step) makes boxxy merge it. An
item whose pull request closed unmerged waits, and the owner sends it back with
`boxxy item retry <item> --phase build` or closes it.
