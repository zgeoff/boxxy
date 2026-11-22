# The work pipeline

The pipeline is the route an item takes from filing to done: triage, design, build, review, and for
some repos verify, merge and check live. The owner writes it as data in the rules file: the phases
in order, where each outcome of a phase sends the item, and how many tries each step gets. boxxy
never stores where an item is. It works that out from the item's settled attempts each time it reads
the item, so a rules change moves every waiting item without a migration. When an outcome needs the
owner, the item holds and the owner gets a notice. Read this doc before you change the rules file, a
phase kind or a launch prompt.

[Attempts](./attempts.md) covers one try at one phase. [Agent sessions](./sessions.md) covers the
session an attempt runs in, and capacity. [Notices](./notices.md) covers how a hold reaches the
owner. The [ship watch](./ship-watch.md) covers the steps that wait for a merge to ship. The
[review, verify and merge design](../../design/boxxy/review-and-merge.md) owns the steps after a
build. The [overview](../overview.md#terms) defines the shared terms.

## Phases and edges

```mermaid
flowchart LR
  triage -->|accepted| design
  triage -->|"duplicate, declined, needs-owner"| hold(["hold for the owner"])
  triage -->|split| split(["end: split"])
  design -->|designed| build
  design -->|blocked| hold
  design -->|abandoned| design
  build -->|built| review
  build -->|blocked| hold
  build -->|abandoned| build
  review -->|passed| reviewed(["end: reviewed"])
  review -->|"changes-requested, 3 times at most"| build
  review -->|failed| review
```

The diagram is the example rules file in `modules/rules/example/`. Each step of a pipeline gives a
phase, the attempts it allows in a row (`maxAttempts`), a time limit (`timeoutMinutes`), and an edge
for every outcome. The phase kind, the server code behind a phase, lists the outcomes, parses the
close-out and says what runs the attempt: an agent session, or a merge job that the runner drives
itself.

An edge is one of these:

- `next` moves the item to the following step, or ends the pipeline after the last one.
- `again` runs the same phase again, and counts against the step's `maxAttempts`.
- `{ to, max, resume, notify }` sends the item to the step of phase `to` and adds one to the item's
  round, the count of its trips back through the pipeline. An edge back to an earlier step, or to
  its own step, needs `max`: the number of times it may run before the item holds with
  `rounds used up`, so every loop ends. `resume: true` wakes that step's
  [kept session](./sessions.md#the-kept-session), so the builder carries on with its context.
- `{ end }` ends the pipeline with a reason.
- `{ hold }` holds the item for the owner with a reason.

Any edge that is an object takes `notify: true`. At settle, an edge with `notify: true` writes a
[notify notice](./notices.md#the-notify-notice) and holds nothing. A `{ hold }` edge with `notify`
writes its hold notice only. `next` and `again` take no `notify`.

## Step gates and skips

A step may gate its attempt. The claim checks the gates before it starts the step, and the first
gate that says skip settles the step as skipped, with no session, pool, seat or lease.

| Step field                          | The step is skipped when                                                         | Reason recorded            |
| ----------------------------------- | -------------------------------------------------------------------------------- | -------------------------- |
| `criteria: { tagged: t }`           | no acceptance line of the item carries the tag `t`                               | `no-criteria-tagged:<tag>` |
| `skipWhen: [{ checkPassed: name }]` | the latest run of the check `name` at the head of the item's pull request passed | `check-passed:<name>`      |
| `waits: [kind]`                     | a [wait kind](./ship-watch.md#the-shipped-wait) the server registers says `skip` | `wait-skip:<kind>`         |

The claim checks `criteria` first, then `skipWhen`, then `waits`, and any one true condition of
`skipWhen` skips. A wait that says `waiting` leaves the item where it is, and the item's state is
`waiting` with the reason `wait:<kind>`. A wait that says `holds` leaves the step to run. The caller
of the state code runs each wait and passes the answers in, so the state code names no wait kind. A
step with `criteria` runs on the matching lines alone: the phase input and the launch prompt's
`acceptance` list only the lines with the tag, and so does the close-out check of its attempt. An
item with an empty acceptance list, which reads as an idea and which no step takes, has no tagged
line, so a `criteria` gate skips its step. The tags an acceptance line may carry are the rules
file's `criterionTags`. `item file`, `item edit` and a triage or design close-out that sets
acceptance refuse a tag the list lacks, and a tag stays on its line in the item's state, its facts
and `item show`.

A step with `waits` may also set `waitNoticeHours: <hours>`, the time that an item may wait at the
step before the owner gets one notice ([the overdue wait](./notices.md#the-notify-notice)). It
applies to every wait kind of the step, and a step that leaves it out takes the `waitNoticeHours`
timeout of the dispatch module. It never skips or holds the item.

A skip comes after a retry lever filed at its own instant, and a retry lever stamped after the
claim's time moves nothing, so a skip always moves the item on. A step with a gate has a `skip`
edge: `next`, `{ end }` or `{ hold }`, never `again` or `{ to }`. A skipped attempt follows that
edge, counts toward no `maxAttempts` and no `max`, and a tag added after the step skipped doesn't
bring it back: `boxxy item retry <item> --phase <phase>` does. A claim that finds the runner paused,
or an item whose repo is missing from `spawn.repos`, records no skip. With no GitHub forge
configured a `checkPassed` condition never skips, and a forge error reads as not passed.

The loader refuses a gate or a wait with no `skip` edge, a condition or a wait kind it doesn't know,
a wait whose `after` outcome no earlier step's phase kind has, a `criteria.tagged` tag that
`criterionTags` doesn't list, a `waitNoticeHours` on a step with no `waits`, a `waitNoticeHours`
that is not a positive finite number, and a `skip` hold that uses an engine hold reason. The rules
file's `repos` section sets how each repo ships, which the [ship watch](./ship-watch.md) reads.

The loader refuses a step that leaves out an outcome of its phase kind, or adds one the kind lacks,
so every outcome has an edge. A phase kind may also list a conditional outcome, one that its step
maps only when the rules file asks for it;
[the merge kind's sign-off outcomes](#owner-sign-off-at-merge) are the case. It also refuses a step
with no time limit, and a phase kind this server can't run: a merge step needs a server with a
`github` section in its config.

## How boxxy decides where an item stands

boxxy replays the item's settled attempts, and each `boxxy item retry` the owner ran, in time order,
through the rules loaded now. Each attempt contributes its stored outcome and round. The result is
the item's position: a phase, an end or a hold.

- **The round belongs to the item.** It starts at 1 and rises with each `{ to }` edge, each
  `boxxy item retry --phase`, and each retry that lifts a `rounds used up` hold. A review of
  reworked code has the build's round, and the reports count any attempt above round 1 as rework.
- **The engine adds three outcomes.** `lost` is the outcome of an attempt that failed without an
  outcome of its phase, such as one with no valid close-out. `lost` acts as `again`. One exception:
  the engine skips a `no-capacity` or `usage-limit` failure, because that work never ran.
  `unsettleable` marks a close-out the phase code could not settle; it has no edge, so the item
  holds. `skipped` marks a step a [gate](#step-gates-and-skips) skipped, and takes the step's `skip`
  edge.
- **The engine adds three holds:** `attempts used up`, `rounds used up` and `outcome not in rules`.
  When a newer phase kind drops an outcome, an item whose stored outcome lost its edge holds with
  `outcome not in rules`. It never falls through to `next`, so no item skips a phase unchecked. The
  loader refuses a rules-file hold with one of these reasons, so a report can tell an engine hold
  from a rules hold.
- **A sign-off lever moves an item from the sign-off hold to the merge step,** and at any other
  position moves nothing ([owner sign-off at merge](#owner-sign-off-at-merge)). It keeps the item's
  round and the count of each `{ to }` edge.
- **`boxxy item retry <item>` lifts a hold** and restarts both counts: the attempts in a row, and
  the runs of each `{ to }` edge. `--phase <phase>` also moves the item to that phase. After a
  passed review, only `--phase build` or a sign-off send-back returns the item to build.

A rules change never touches a live attempt: the attempt settles by the phase kind loaded when it
settles. An item between attempts stands wherever the new rules put it. It can move to another
phase, leave a hold because a `maxAttempts` or `max` went up, or take a hold because one went down.
That last case sends no notice, because boxxy writes notices only at settle. Run
`boxxy rules dry-run <file>` before a rules change merges: it prints each open item's position now
and under the new rules, and writes nothing.

## When an item needs the owner

A hold stops the item until the owner acts, and the settle that leaves an item on hold writes a
notice ([notices](./notices.md)). An agent asks the owner a question the same way: it closes out
`blocked` with the question as its reason, or `needs-owner` at triage. The owner reads the question
with `boxxy item show`, answers with `boxxy item note`, and runs `boxxy item retry`.

The next attempt gets the question in `{{ stopped }}` and the answer in `{{ notes }}`, and sees
nothing else of the last attempt's work. The example prompts therefore tell a blocked agent to put
its progress in the reason too.

A close-out can also ask for changes, such as filing new items, adding relations or closing the
item. When its edge is a hold, settle files the new items but withholds every change to the item
itself, so the owner decides first. One change goes through: a `blocks` relation from another item
to this one, so a blocked design or build still waits on that item after the retry.

## Limits and pools

An item's design runs in `agent` mode by default. In `attended` mode the owner works with the agent
in its session, and the agent closes out when the owner is done. The owner sets `designMode` when
filing or editing the item, or a triage close-out sets it. An attended design takes its seats even
when the owner is away, so it sleeps and gives them back after `sleep.afterUnattendedMinutes` with
no owner attached.

A limit caps how many attempts run at once. It has a name, a maximum and a filter on the phase and
the item's fields. The claim starts an attempt only when every limit that counts it has a free seat,
and a sleeping attempt gives its seats back. The example caps all attempts with `workers`, and
attended designs with `owner-design`. A limit is only an upper bound: the atc target can have fewer
free machines, and atc then refuses the session
([capacity](./sessions.md#capacity-and-the-usage-limit)).

A pool decides which ready item the claim takes next: it takes the items its filter matches, in its
order, and the owner's levers, defer and expedite, change that order. A pool sets no count, so the
loader refuses a pool unless some limit counts every attempt it can start.

## Pausing the runner

`boxxy runner pause` stops the claim, so no ready item starts or wakes, and `boxxy runner resume`
lets it run again. Live attempts go on, and a restart keeps the pause. Each switch writes a fact in
the same change as the row, `boxxy.runner.paused` or `boxxy.runner.resumed`, with the runner as its
entity, the owner as its actor, and any `--reason` of a pause. The server logs one line for each
switch, and `boxxy status` shows the pause: since when, by whom, and the reason. A repeat pause or
resume changes nothing and writes no fact, so the first pause keeps its time and reason. The owner
gets a [notice](./notices.md#the-paused-runner-notice) when a long pause leaves work ready.

## Recipes and skills

The rules file's `kinds` section gives each item kind, such as `core.issue`, a pipeline and a recipe
per phase. A recipe sets the agent, the model, the launch prompt template and the skills. Each
kind's recipe map is keyed by phase name, and its key `design/attended` gives the recipe for an
attended design. A repo's `repos.<repo>.recipes` map, keyed the same way, replaces the kind's recipe
for a phase in that repo only, and the loader refuses a name the file doesn't define
(`missing-repo-recipe`). A step's recipe resolves in this order, and the first match wins: the
repo's `<phase>/attended`, the repo's `<phase>`, the kind's `<phase>/attended`, the kind's
`<phase>`. An `/attended` entry counts only for a design in attended mode.

- **Skills are pinned.** The rules file pins one commit of one skills repository, and each recipe
  lists the skills its phase needs. The
  [session-start hook](../interfaces/cli-and-hooks.md#installing-skills) fetches them into the
  session's workspace, and a skill it can't install fails the attempt as `skill-missing`.
- **Each attempt records a recipe hash** over its recipe, its templates, the rules version and the
  skills pin, so the reports keep attempts of a changed recipe apart.
- **`session: builder` on a recipe** runs its phase in the build's
  [kept session](./sessions.md#the-kept-session) instead of a fresh one, such as a verify that
  grades the build where it was built.
- **A build recipe has no check command.** The agent follows the repo's own agent instructions.
- **A credentialed agent runs only where the server config scopes it.** The loader checks each
  recipe, a repo's own included, against `spawn.agents`, for every repo in `spawn.repos` and every
  kind and step, resolving each repo's overrides first
  ([who holds a credential](./sessions.md#who-holds-a-credential)). It refuses a recipe that names a
  listed agent outside its phases or repos (`agent-outside-scope`), a recipe for a
  `requireScopedAgent` phase whose agent isn't listed for it (`phase-without-scoped-agent`), a
  `session: builder` recipe that runs a listed agent, or that wakes the session of a build that runs
  a listed agent (`scoped-agent-builder-session`), and a `resume: true` edge into a phase a listed
  agent runs, or in a pipeline whose build runs a listed agent (`scoped-agent-session-resumed`). The
  loader checks each kind with its own pipeline and recipes. A repo's `session: builder` recipe
  needs a build step before its phase in every kind that runs the phase, as a kind's recipe does
  (`builder-session-not-kept`). The review phase sets `requireScopedAgent`, so every review runs on
  the review agent.

## The live phase kind

The `live` phase kind checks a shipped item's acceptance lines against the deployed system. A rules
file puts it after a `shipped` wait, with a `criteria` gate that picks the lines to check. Its
outcomes are `confirmed`, `broken`, `blocked` and `abandoned`.

The claim gives the session the item's merged pull request, its merge commit, the
[shipped row](./ship-watch.md#the-watch) of that commit, and the lines that the step's
`criteria.tagged` matches. Each of the first three is null when the item has none.

The close-out holds a `lines` list for `confirmed` and `broken`, one entry for each line checked:
`criterionId`, `passed` and `evidence`. The parser refuses a line for a criterion that the input
lacks, and a `broken` close-out with no failing line. A `broken` close-out also holds a `bug`, an
open item whose kind must be `bug` and whose `acceptance` lists the failing lines with their tags.
`blocked` and `abandoned` hold a `reason`.

- `confirmed` and `broken` succeed. `blocked` and `abandoned` fail, with the outcome as the failure.
- A `broken` close-out files its `bug` through the `file-item` effect, with a `relates-to` link to
  the checked item, so the rules file must list `relates-to` in `relationTypes`. The filed item
  keeps the acceptance lines and their tags, so its own live step, when its pipeline has one, checks
  them again. Any open item a close-out files may carry `acceptance`, and each tag must be in
  `criterionTags`. The checked item ends rather than going back to build, because its pull request
  has already merged: a fix needs a new pull request, and a new item keeps each item's cost and land
  time apart in pepys.
- The evidence stays in the item and the close-out. boxxy posts nothing to a pull request.

## The launch prompt

A session reads its whole task from its launch prompt. The claim renders it from the recipe's
[Liquid](https://liquidjs.com/) template, filling these placeholders:

| Placeholder           | Value                                                                                                                   |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `title`, `repo`       | the item's title and repo                                                                                               |
| `item_ref`            | the item's short reference, such as `i-12`                                                                              |
| `outcome`, `body`     | the outcome the owner wants, and the body, as written                                                                   |
| `acceptance`          | one `- <id>: <text>` line per criterion; only the lines with the step's `criteria.tagged` tag when it has one           |
| `design`              | the latest design's text, then `Location: <location>` when it has one; a build only                                     |
| `conclusion`          | the latest design's conclusion, such as the result of an investigation; a build only                                    |
| `findings`            | what sent the build back, from a [review](#the-review), a verify or the [owner](#owner-sign-off-at-merge); a build only |
| `stopped`             | the question or reason where the latest attempt of this phase stopped; empty after any other close-out                  |
| `notes`               | one `- <YYYY-MM-DD>: <text>` line per note, oldest first                                                                |
| `security`            | `true` when the item has the security mark, else empty                                                                  |
| `ticket`              | the whole item, `# <title>` then each non-empty section under its own heading; leaves out `security`                    |
| `attempt_id`, `input` | the attempt's ID, and its input as JSON                                                                                 |

Every placeholder but `ticket` gives its content only, with no heading. A template author needs four
rules:

- **An empty section is the empty string,** which `{% if name %}` reads as false. Put each section's
  heading inside its `if`, and open the tag with `{%-` so an empty section leaves no blank line.
- **A value reaches the agent as written.** Liquid never parses a value again, so `{{ }}` inside an
  item's text stays text.
- **A template the loader accepts always renders.** The loader refuses as `bad-prompt` a template
  that could throw at claim, such as one that binds a name in a branch that might not run.
- **A `for` loop over a placeholder runs once**, with the whole value, or never for an empty one.

A recipe may name a second template in `reworkPrompt`, which the claim renders when an earlier
attempt of the same phase succeeded, such as a build that a review sent back. When the item has a
kept session, the claim wakes it with this prompt, so the agent gets just the new findings.
Otherwise a fresh session starts with it, so the rework template must carry the whole task, for
example with `{{ ticket }}`.

## The build close-out

A `built` close-out cites evidence for every line of the item's acceptance list, and the cited IDs
join the list when the attempt settles. The server checks nothing about a `test`, `ci-run` or
`live-check` citation. A `check` or `verdict` citation is checked evidence: the server read the
result from GitHub at the pull request's head when the agent recorded it, and refuses the close-out
with `stale-evidence` when the head has moved since, or when no open pull request gives a head, such
as a closed or merged one ([evidence](./attempts.md#evidence)). The merge step never reads checked
evidence again.

## The review

The [review gate design](../../design/boxxy/review-and-merge.md#the-review-gate) owns the review. A
review session runs one command that the review gate, boxxy's adapter for the noslop review tool,
builds, and sends the tool's raw result as its close-out. The server checks that the result covers
the pull request's head commit, then posts it to the pull request. A failed call, or a result for
another commit, settles `failed`.

The next build's `findings` gives the commit the review read, the open findings counted by severity,
and the gate's text on how to answer them, never the findings' text
([decision 0009](../../decisions/0009-close-outs-hold-what-only-the-agent-knows.md)). After a failed
verify, `findings` gives the commit the verify ran at and the features that failed.

## Owner sign-off at merge

The merge step runs as a job that reads its pull request on each tick, and the pure merge rule in
`@boxxy/train` decides each read. The rules file can name changes that need the owner's sign-off,
such as an edit to a skill. When such a pull request is otherwise ready to merge, the merge step
finishes `needs-signoff` and the item holds until the owner approves the head commit or sends the
item back to the build with findings.

```mermaid
flowchart LR
  review -->|passed| merge[merge job]
  merge -->|"no rule matches, or approved at this head"| merged
  merge -->|needs-signoff| hold[sign-off hold]
  hold -->|"item.signoff: approve or send-back"| merge
  merge -->|"changes-requested, after a send-back"| build
  merge -->|"stale: a push after the review"| review
```

The rules file names the changes under `merge.signoff`, and maps the two outcomes on the merge step:

```yaml
merge:
  method: squash
  checks: ['pr / checks']
  signoff: # with none, no merge waits for the owner
    - name: skills # shown to the owner as the reason the item waits
      paths: # globs over the paths the pull request changes, from the repo root
        - '**/SKILL.md'
        - '**/skills/*/references/**'
      repos: [acme/skills] # optional; with none, the rule matches in every repo

pipelines:
  build:
    - phase: merge
      on:
        needs-signoff: { hold: owner sign-off } # the sign-off hold
        changes-requested: { to: build, max: 3, resume: true }
```

- **A rule matches** when any changed path matches any of its globs and its `repos` is absent or
  lists the pull request's repo. A glob matches dot folders and matches case-sensitively. A renamed
  file counts at its old and new path, and a deleted file at its path.
- **The loader ties the edges to the rules.** With `merge.signoff` set, it refuses a merge step that
  leaves out `needs-signoff` or `changes-requested`, a `needs-signoff` edge that is not a `{ hold }`
  edge, and a `changes-requested` edge that is not a `{ to }` edge. With none set, it refuses both
  edges. The hold that `needs-signoff` names is the sign-off hold.
- **The job reads the changed paths** only when some sign-off rule covers the pull request's repo,
  and passes `not-read` otherwise. After it reads the paths, it reads the head again, and when the
  head moved it starts the read over at the new head. When the forge can't list the paths, the read
  throws and the next tick reads again, so the job never merges a change whose paths it didn't read.
  When the forge lists fewer files than the pull request changes, the list is `truncated`, and the
  rule treats it as a match.
- **The job reads the owner's verdict** from the item's latest sign-off lever that no merge attempt
  has finished on since. An approval counts until the head moves, and a send-back counts for one
  merge attempt, so one send-back sends the item back once. A verdict counts only at the head the
  job read.

The merge rule checks these in order, and the first that decides ends the attempt:

1. The pull request merged or closed: `merged` or `closed`.
2. A send-back verdict at the current head: `changes-requested`.
3. The review doesn't cover the current head: `stale`, back to review. The owner so never reads a
   head that no review covers.
4. A conflict or a red check: `repair`.
5. A pending check or an unknown mergeable state: the job waits.
6. The forge refused the merge: `refused`.
7. A sign-off rule matched, or the list is `truncated`, and no approval at the current head:
   `needs-signoff`.
8. The job merges at the current head.

An item waits for a sign-off when it stands at the sign-off hold and its latest merge attempt
finished `needs-signoff`. The close-out of every merge attempt that matched a rule, or read a cut
list, holds `signoff`: the rules that matched, up to 50 matched paths and whether the list was cut.
A `changes-requested` close-out holds `sentBack`: the head the owner read and the findings.

The owner lists the waiting items with `signoff.list`, oldest first by when each reached the hold,
and answers one with `item.signoff` at the head the list gave
([API and auth](../interfaces/api-and-auth.md#the-owners-sign-off)). One call writes one lever, a
`signoff.approve` or `signoff.send-back` lever with the head and, for a send-back, the findings in
its `reason`, and the lever moves the item from the sign-off hold to the merge step. The merge step
then decides again. A send-back that runs a `{ to }` edge out of tries holds the item with
`rounds used up`, as at any `{ to }` edge.

`boxxy item retry` at the sign-off hold works as at any hold: it restarts the counts, keeps the
round, and sends the item to the merge step, which asks the owner again. When new rules drop
`merge.signoff`, an item at the sign-off hold replays into the `outcome not in rules` hold, and
`item retry` moves it on to a merge with no sign-off.

When a `changes-requested` merge attempt is the latest attempt that sent the build back, the next
build's `findings` prints the owner's text whole, with the head the owner read. A review's findings
reach a build as counts only, because the owner's text lives nowhere else.

## What an item records

boxxy is the only record of the work. Each fact carries the full text it changes, so pepys can
rebuild every item from the facts alone ([facts and pepys](../interfaces/facts-and-pepys.md)), and
no fact links to an outside tracker.

- **The body** is markdown for the agent: context, scope, permissions and notes. boxxy never parses
  it, and an edit or a triage close-out replaces it whole.
- **Labels** are free short strings, and an edit replaces the whole list.
- **Notes** are append-only, and every later launch prompt carries them.
- **The security mark** flags work on a security weakness. The owner sets it when filing or editing,
  and a close-out can set it on an item it files. Only a template reads it, through
  `{{ security }}`.
- **Relation types are rules data**, such as `blocks`, `duplicate-of` and `relates-to`.
  `boxxy item close <item> --of <other>` closes an item as a duplicate and adds the `duplicate-of`
  relation in one change.

## Derived item state

An item's state is derived on every read, from its position, attempts, acceptance list, pull
requests and relations. The first row that matches wins:

| State      | When                                                                                                                       |
| ---------- | -------------------------------------------------------------------------------------------------------------------------- |
| `archived` | the item is closed                                                                                                         |
| `held`     | the owner filed it held, and hasn't released it                                                                            |
| `running`  | it has a live attempt, sleeping or closing ones included                                                                   |
| `waiting`  | its position is a hold, with the hold's reason                                                                             |
| `done`     | its position is an end, and a pull request linked to a succeeded build has merged                                          |
| `waiting`  | its position is an end and nothing merged: `pull request open`, `no pull request linked` or `pull request closed unmerged` |
| `idea`     | its phase needs an acceptance list and it has none                                                                         |
| `waiting`  | its step has a [wait](./ship-watch.md#the-shipped-wait) that says waiting, with the reason `wait:<kind>`                   |
| `blocked`  | an item that `blocks` it is neither done nor archived                                                                      |
| `ready`    | anything else                                                                                                              |

A held item is the owner's draft: `boxxy item release` starts it at triage. Build, review, verify
and merge need an acceptance list. An `accepted` triage must leave one and a `designed` close-out
may replace it, and the claim never starts an `idea` item until the owner adds one or runs
`boxxy item retry --phase design`. The `blocked` state means another item is in the way; a `blocked`
outcome is different, and makes the item `waiting`.

At an end, the state reads whether the pull request merged, never a merge phase's outcome, so a
merge by hand and a merge by boxxy both make the item `done`. A
[pull request link](../interfaces/github.md#linking-a-pull-request) comes from the agent's hook or
the server's watch. An item on hold stays `waiting` even when its pull request merges. When the pull
request closed unmerged, the owner runs `boxxy item retry <item> --phase build` or closes the item.
