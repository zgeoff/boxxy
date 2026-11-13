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
| review | the session sends the review tool's raw result, and the server reads it through the `ReviewGate` port into the close-out ([review, verify and merge](./review-and-merge.md#the-review-gate)); in v1 the review session sends the verdict and the findings as text ([v1](./v1.md#the-review)) |

## The v1 phase kinds

`modules/closeout/src/phases/` holds the four phase kinds of [v1](./v1.md#the-pipeline), `triage`, `design`, `build` and `review`, and the `verify` and `merge` phase kinds of [review, verify and merge](./review-and-merge.md#the-verifier). The runner writes the merge close-out from the drive's finish ([job attempts](./review-and-merge.md#job-attempts)). `phaseKinds` lists each one that needs no port for the rules loader, and the server adds the review phase kind, which it builds on its review gate. `libs/model/src/closeouts/types.ts` holds each close-out body and each input.

Each parser runs these steps, and a failed step returns every problem it found and skips the steps after it:

1. Drop each friction entry with no target, and count it in `frictionDropped`. boxxy ignores a count the agent sends.
2. Check the body against the phase's schema. Every schema problem comes back, with its path in the body as sent.
3. Build the stored body, and check the phase's rules, such as `no-acceptance`.
4. Measure the stored body. One over 120,000 bytes is `too-large`, so the `closed_out` fact always fits one outbox item. `closeOutLimits` in `modules/closeout/src/close-out-limits.ts` holds the limit.

The parser cuts no list. A cut finding or open item would be work lost with no count, and the byte limit already bounds the fact. Each parser also gives `jsonSchema`, the JSON Schema of the body the agent sends, which `attempt.current` passes to the session.

| Phase | The parser refuses | The settle |
| --- | --- | --- |
| triage | `accepted` that leaves the item with no acceptance list; a `split` with no part; an unknown item, kind or relation type; a relation to the item itself; a relation named twice, counting the `duplicate-of` relation of a `duplicate` | succeeded. Asks to set the kind, the design mode, the acceptance list, numbered from `a1`, and the body, to add each relation, to file each part of a `split`, and to close a `duplicate`, `declined` or `split` item |
| design | nothing past the schema | `designed`: succeeded. Asks to file each open item, and to set the acceptance list, numbered from `a1`. `blocked`, `abandoned`: failed, with the outcome as the failure |
| build | a criterion the item lacks; evidence of another attempt; `built` with a criterion that has no evidence | as design. Asks to file each open item, and, when `built`, to add the cited evidence to the acceptance list |
| review | a body that is not the `ReviewCloseOut` the server built from the gate's reading | passed: succeeded `passed`. Blocked on open findings: succeeded `changes-requested`. Any other reading: failed, with the failure `review-failed` |
| verify | a body that names its own `session`; the parser copies `session` from the attempt's input | `verified`, `failed`: succeeded, because the grader graded the work. `blocked`, `abandoned`: failed, with the outcome as the failure |
| merge | a body with a field that `MergeCloseOut` lacks, or one that lacks a field | `merged`: succeeded. Asks to record the merge of the input's pull request. Any other outcome: failed, with the outcome as the failure |

A blocked or abandoned design, build or verify fails, so it never reads as done work and no session is kept for it. Its failure is the outcome name. The engine reads some failure names, such as `no-capacity`, and the agent's free-text reason could match one, so the reason stays in the close-out. Every settle also asks to record each friction entry as a proposal. The settle returns the effects and the outcome, and the caller applies the effects. When the rules map the outcome to a hold, the caller withholds each effect that changes an item ([v1](./v1.md#the-pipeline)).

The review session sends the review tool's raw result. The server passes it to `ReviewGate.accept`, and builds the `ReviewCloseOut` from the reading: the round, its cause, the reading and `unrelatedLines` ([the review gate](./review-and-merge.md#the-review-gate)). The review parser then checks that built body, and the repeat check hashes the raw result.

A review close-out stored before the review gate holds the session's `verdict` and a summary of noslop's result. Every read of a stored close-out, in the store, the facts, the phase inputs and pepys, reads it as a `ReviewCloseOut`, with no change to the stored data. The review parser still rejects that shape, so a session can never send it.

| v1 field                                   | Read as                                                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `verdict` `passed`                         | a `passed` reading with no open finding                                                                                         |
| `verdict` `changes-requested`              | a reading blocked on `open-findings`. Each finding counts as `high`, because v1 kept no severity and each one sent the item back |
| the findings' `path`s                      | `findingPaths`, which the next review's `unrelatedLines` reads                                                                  |
| the findings' titles, places and bodies    | `answerHint`, which the next build's launch prompt shows, because the review tool never held those findings                     |
| `noslop.head`, `noslop.reviewID`           | the reading's `head` and `ref`                                                                                                  |
| no round, cause, cost or `unrelatedLines`  | `round` and `cause` null, no calls, `unrelatedLines` null                                                                       |
| `noslop.report`, the counts, `friction`    | dropped. The settle of that review already recorded the friction as proposals                                                   |

Triage, design and build get the item's acceptance list in their input, and where the item's latest attempt of the same phase that closed out stopped, in `stopped`: the `question` of a `needs-owner` triage, or the `reason` of a `blocked` design or build. After any other close-out, `stopped` is null. An attempt that ended with no close-out, such as at its timeout, is skipped, so its retry still gets the question. A build also gets the latest design, the open counts and `answerHint` of the latest review when it was blocked on open findings, and the item's latest pull request. A review gets its round, its cause, the item's pull request and the command to run. A verify gets the item's pull request, the head that its latest passed review read, and the `session` of its recipe, `fresh` when the recipe sets none. The [launch prompt](./v1.md#the-launch-prompt) carries the design, the findings, where the last attempt stopped and the notes of the item, so the session needs no command to read its task.

The design close-out holds `{ text, location }`. `text` is the whole design in markdown, code blocks included, and the limit of the whole close-out bounds it. `location` is a pointer to a doc in the repo, or null. A design close-out stored with `summary` in place of `text` reads as `text`, with no change to the stored data.

A design starts on an item with no acceptance list, and build, review and verify do not: an item that stands at one of them with no list derives `idea`. A `designed` result may also carry `set.acceptance` and `openItems`. `set.acceptance` has the shape of the triage field and replaces the item's acceptance list, and the settle records it in a `boxxy.item.edited` fact with the attempt in `byAttempt`. `openItems` has the shape of the build field, and the settle files each entry through the same dedupe. A `blocked` or `abandoned` result carries neither, and the parser refuses one that does: a blocked design waits on the owner's answer, and the next design attempt sends its list and its open items. Its `reason` holds the question and what the design settled so far, because the next design gets that reason in its input.

A triage result is one of five, and each has one use:

| Result | Carries | Use | The settle asks |
| --- | --- | --- | --- |
| `accepted` | nothing | boxxy does the work | nothing past `set` and the relations |
| `duplicate` | `of`, the other item | another item asks for the same work | to close the item, with the `duplicate-of` relation |
| `declined` | `reason` | boxxy refuses the work | to close the item, with the reason |
| `needs-owner` | `question` | only the owner can decide, such as a choice of scope | nothing. The rules hold the item, the owner reads the question with `boxxy item get`, answers with `boxxy item edit` or `boxxy item note`, and runs `boxxy item retry`, which runs triage again |
| `split` | `openItems`, one part at least, in the shape of the build field | the item holds several pieces of work that can each be done alone | to file each part through the dedupe of open items, and to close the item with the reason `split`. When the close applies, the dedupe leaves the item out, so a part with the item's title still files |

Each part of a split holds the triage attempt in `foundInAttempt`. The parts get their IDs in the settle, so no relation draft can name them. The rules' edge decides the item's end: a hold edge withholds the close, and the parts still file.

A triage close-out may set the kind, the design mode, the acceptance list, the body and the relations. `set.body` is the whole new body, of 40,000 characters or fewer, and replaces the item's body. The settle records it in a `boxxy.item.edited` fact with the attempt in `byAttempt`, so the item's revisions show triage as the author, and the launch prompt of each later phase carries the new body.

## Derived from facts

boxxy never asks the agent for these, because a fact records each one:

| What | Source fact |
| --- | --- |
| commits and PRs | the trailer and the PR hook ([below](#linking-attempts-to-commits-and-prs)) |
| CI results | GitHub check runs |
| review findings | the review tool, through the `ReviewGate` port: counts by severity in the review close-out ([review, verify and merge](./review-and-merge.md#the-review-gate)); in v1, the review close-out |
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
