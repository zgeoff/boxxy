# GitHub

boxxy uses GitHub to link each build to the pull request its agent opened, to notice when that pull
request merges or closes, to merge it when the pipeline has a merge step, and to read what a review
covers. Every one of those calls goes through one adapter, which signs in as the boxxy GitHub App,
or sends no credential when a proxy adds one on the way out. Two paths link a pull request: the
agent's hook links it the moment the agent opens it, and a watch that the server runs on a timer
links what the hook missed and records merges and closes. Read this doc before you change how boxxy
follows pull requests or talks to GitHub.

[The CLI and the hooks](./cli-and-hooks.md#the-pull-request-hook) covers the hook's side of a link.
[Facts and pepys](./facts-and-pepys.md) covers the facts a link and a merge send. The
[merge step design](../../design/boxxy/review-and-merge.md#the-merge-step) covers the merge job. The
[overview](../overview.md#terms) defines the shared terms.

## Linking a pull request

The hook and the watch write a link the same way, in one store transaction: a pull request row,
which the watch later reads to follow the pull request; an evidence row that ties the URL to the
build attempt, in the same list a close-out cites; and the `boxxy.pull_request.linked` fact. The
server records which path made the link, `hook` or `watch`, in the evidence row and the fact. The
watch follows only open rows, so when GitHub already shows the pull request merged or closed, the
server stores the row that way in the same transaction and writes the matching fact.

A link writes no attempt row, so it never takes the attempt's lease and never races the settle. The
two paths make sure the link goes to the right attempt in different ways: the watch links only a
build that already succeeded, and the hook links while the attempt is live, so the server checks the
calling session on every hook call.

### The hook's call

The server first checks that the call comes from the calling session's current attempt, whose row
must hold the [proven caller](./api-and-auth.md#the-proven-caller), as for a
[close-out](../work/attempts.md#close-outs-and-their-limits). It then reads the pull request from
GitHub. A newer attempt can take over the session while GitHub answers, so the server checks the
session again inside the store's write lock before it writes, and that second check refuses the old
attempt's link. The server compares the URL's repo with the item's repo ignoring case, as GitHub
does, and stores the item's spelling, so every row and fact of a repo has one key.

Only a first `linked` answer writes anything:

| Answer                              | When                                                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `linked`                            | GitHub knows the pull request, and no attempt has linked it yet                                         |
| `linked`, with `repeat: true`       | an attempt of the same item already linked it                                                           |
| `retry`                             | the GitHub call failed, GitHub doesn't find the pull request yet, or the config has no `github` section |
| `refused`, `not-a-pull-request-url` | the URL is not a pull request's, or its repo is not the item's                                          |
| `refused`, `linked-elsewhere`       | an attempt of another item already linked it                                                            |
| `refused`, `not-current`            | the call is for an attempt that isn't the session's latest, at either check                             |
| `refused`, `no-attempt`             | the session has no attempt, or its latest attempt doesn't hold the proven caller, at either check       |

After a `retry`, the watch links the pull request on a later pass. Besides the limits in
[the pull request watch](#the-pull-request-watch), it misses the pull request when:

- the config has no `github` section, so the watch never runs;
- the pull request merges or closes before that pass, and the watch finds only open ones;
- none of its commits carries the build's `Boxxy-Attempt` trailer.

## The pull request watch

When the config has a `github` section, the server runs a pass of the watch on a fixed interval. A
GitHub call that throws writes nothing and counts as unanswered; the server logs a warning for a
pass with any unanswered call, and the next pass tries again. A pass links what the hook missed,
then follows each open pull request:

1. **Link what the hook missed.** For each succeeded build with no pull request row, the pass lists
   the open pull requests of its repo and links the first one holding a commit whose
   `Boxxy-Attempt: <attempt_id>` trailer holds that build's ID. It skips a build whose item already
   has an open pull request. It also skips a build that ended longer ago than a fixed link window,
   so a build that never opened a pull request stops costing GitHub calls.
2. **Follow each open pull request.** For each commit whose trailer holds the ID of an attempt of
   the row's item, it writes an evidence row for that attempt and a `boxxy.commit.linked` fact, once
   per commit. When the pull request has merged or closed, it moves the row and writes
   `boxxy.pull_request.merged` or `boxxy.pull_request.closed`.

boxxy never writes the trailer itself. An agent adds it only when its recipe's prompt includes
`{{ attempt_id }}` ([the launch prompt](../work/pipeline.md#the-launch-prompt)). The example build
prompt doesn't, so for a build without the trailer, only the hook can link its pull request.

A merge job's settle records the merge too. The settle and the watch each update the row only while
it is open, so whichever comes first moves it, and each merge gets one `boxxy.pull_request.merged`
fact.

## The GitHub adapter

`@boxxy/forge-github` is boxxy's adapter for GitHub's REST API. The hook and the watch read pull
requests through it. The merge job reads checks and merges through it, and reads the verify gate's
check and report through the [verifier](../repo/verify-journeys.md#what-the-merge-step-reads). A
review's close-out reads the files changed since the previous review
([the review](../work/pipeline.md#the-review)).

The server calls GitHub at the config's `github.baseUrl`, as the boxxy GitHub App when it has the
App's keys: `BOXXY_GITHUB_APP_CLIENT_ID`, `BOXXY_GITHUB_APP_PRIVATE_KEY` and
`BOXXY_GITHUB_APP_INSTALLATION_ID`. It refuses to start with only some of them, or one it can't
parse, and names the variable, never its value. The adapter signs a JWT with the App's key, as
[GitHub recommends](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app),
trades it for an installation token, and refreshes the token shortly before it expires. A failed
trade throws an error with GitHub's status but without the request, because the request carries the
signed JWT; the next call tries again.

Without the keys, the adapter sends no credential, for a server behind a proxy that adds one on the
way out. The server takes no personal token in place of the App, because a fine-grained token has no
`Checks` permission and GitHub refuses its read of a private repo's check runs. Without a `github`
section, the server builds no adapter: hook links answer `retry`, the watch never runs, and no merge
job exists, so the loader refuses a rules file with a merge step. The server builds the verifier
with the adapter, so it builds no verifier either, and a `check` or `verdict` call answers
`no-forge`.

- **A throw means GitHub didn't answer,** and the caller tries again later. These results come back
  as values instead: a pull request GitHub doesn't find is `not-found`; a merge whose head moved is
  `head-moved`, because the merge request carries the head whose checks the job read and GitHub
  merges only that head; and a merge GitHub refuses, such as for a conflict, is `not-mergeable` with
  GitHub's message.
- **The adapter reads GitHub's own ID of each pull request** beside its number, because pepys joins
  an attempt to its pull request by that ID ([the join keys](./facts-and-pepys.md#the-join-keys)).
  It also reads the base branch, whose required checks the merge job reads, and the head's SHA from
  GitHub's `head.sha`. The commit list is paged, so its last entry can be older than the head.
- **Paged lists stop at a page cap** and keep what they read: a repo's open pull requests, a pull
  request's commits, and the check runs and statuses at a head. A repo with more open pull requests
  than the cap holds can leave a build unlinked by the watch. The read of a branch's rules throws
  past its cap instead, because a rule it didn't read could be a required check.
- **The changed paths come from the pull request's file list,** which pages up to 3,000 files, in
  place of the 300 of the compare. Each renamed file gives its old path too. The read also carries
  the pull request's own count of changed files, and a list shorter than the count is `truncated`. A
  call that fails throws, so the merge job reads again on its next tick.
- **Each check name reports its newest run,** and whether that run is a check run or a commit
  status. A check run wins over a commit status of the same name, and a run that ended with neither
  a pass nor a failure, such as `cancelled` or `skipped`, reads as `other`.

### The checked evidence reads

A `check` or `verdict` call reads the pull request's state and head, then the checks at that head,
through the same adapter as the hook and the merge job
([the mapping to an answer](../work/attempts.md#evidence)). A `verdict` also asks the verifier,
which reads the pull request's description for the verify report, and the verify gate's check run at
the head. A build's `built` close-out that cites checked evidence reads the pull request again for
its head ([the close-out](../work/attempts.md#close-outs-and-their-limits)). When a GitHub call
throws, the call that made it answers `retry` and writes nothing.

### The ship reads of the adapter

The [ship watch](../work/ship-watch.md#the-watch) also reads these through the adapter:

- `readRepo` answers `readable`, or `not-found` for a repo that is missing or that the App cannot
  read.
- `readTag` gives the commit a tag names, through any annotated tag objects, or `null` for no such
  tag. A tag name with a slash is read as one name.
- `contains` asks GitHub's compare of the commit with the ref, and is true when the ref is ahead of
  the commit or the same as it. A commit or ref GitHub does not find is false.
- `listReleases` gives the published releases of a repo, newest first, with the first 100 of them
  read. A draft has no publish time and is left out.
- `readBumps` gives the pull requests that GitHub types as `Bot` and that merged at or after a time,
  oldest merge first. It reads closed pull requests by last update and stops at the first page that
  ends before the time, within a page cap.

The App needs at least `Contents: read` on every repo that a `ships` rule names, the deploy repo of
a `then` included.

The owner installs the boxxy App on each repo boxxy works on, with these repository permissions:

| Permission        | Access         | boxxy reads or writes                                      |
| ----------------- | -------------- | ---------------------------------------------------------- |
| `Metadata`        | read           | the branch rules and protection behind the required checks |
| `Contents`        | read and write | the changed files, and the merge                           |
| `Pull requests`   | read and write | the pull request reads, the mergeable state, and the merge |
| `Checks`          | read           | the check runs                                             |
| `Commit statuses` | read           | the commit statuses                                        |
