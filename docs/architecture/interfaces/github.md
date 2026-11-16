# GitHub

boxxy makes every GitHub call through one adapter. With it, boxxy links each build attempt to the
pull request that its agent opened, and records when that pull request merges or closes. The merge
step uses the same adapter to read checks and merge pull requests;
[Review and merge](../../design/boxxy/review-and-merge.md) holds that step's design.

The pull request hook in the agent's session links a pull request as soon as the agent opens it. A
watch that the server runs on a timer links each pull request the hook missed, and records merges
and closes.

[The overview](../overview.md#terms) defines the terms this doc uses, such as item, attempt, settle,
job, fact and forge. [Attempts](../work/attempts.md) covers attempts, their leases and the settle.
[The CLI and the hooks](./cli-and-hooks.md#the-pull-request-hook) covers the hook that sends the
pull request URL, and what it does with each answer. [Facts and pepys](./facts-and-pepys.md) covers
the facts that a link and a merge send.

## The pull request watch

A link writes, in one store transaction, the pull request row, an evidence row that ties the pull
request's URL to the attempt, and the `boxxy.pull_request.linked` fact. The evidence row and the
fact record where the link came from, `hook` or `watch`. When GitHub already shows the pull request
merged or closed, the same transaction stores the row as merged or closed and writes
`boxxy.pull_request.merged` or `boxxy.pull_request.closed`, because the watch follows only open
rows. A link never takes the attempt's lease. The watch links a build only after the build succeeded
and its settle released the lease, and the hook's link checks the calling session instead.

### The hook's call

The hook sends the URL that `gh pr create` printed. The server checks that the call comes from the
current attempt of the calling session, as
[Close-outs and their limits](../work/attempts.md#close-outs-and-their-limits) describes. It reads
the pull request from GitHub, then checks the session again inside the write's lock. A newer attempt
can take over the session while GitHub answers, and the second check stops the old attempt from
linking. The server compares the URL's repo with the item's repo ignoring upper and lower case, as
GitHub does, and stores the item's spelling, so every row and fact of a repo has one key.

Every answer except the first `linked` writes nothing:

| Answer                              | When                                                                                                                         |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `linked`                            | GitHub knows the pull request, and no attempt has linked it yet                                                              |
| `linked`, with `repeat: true`       | an attempt of the same item already linked this pull request                                                                 |
| `retry`                             | the GitHub call failed or doesn't find the pull request yet, or the server has no `github` section; the watch links it later |
| `refused`, `not-a-pull-request-url` | the URL names no pull request, or a pull request in a repo other than the item's                                             |
| `refused`, `linked-elsewhere`       | an attempt of another item already linked this pull request                                                                  |
| `refused`, `not-current`            | the call names an attempt that isn't the session's latest, at either check                                                   |
| `refused`, `no-attempt`             | the session has no attempt, or its latest attempt records no caller or another caller than the proven one, at either check   |

### One pass of the watch

The server runs a pass every `watchMs`, set in `start-server.ts`, when its configuration has a
`github` section. A GitHub call that throws writes nothing and adds one to the pass's `unanswered`
count. The server logs a warning for a pass with any unanswered call, and the next pass tries the
call again.

1. **Link what the hook missed.** For each repo with a succeeded build that has no pull request row,
   the pass lists the repo's open pull requests and reads each one. It links the build to the first
   pull request that holds any commit whose `Boxxy-Attempt` trailer names the build. It skips a
   build whose item already has an open pull request row. It also skips a build that ended longer
   ago than `watchLimits.linkWindowMs`, so a build that opened no pull request stops costing GitHub
   calls.
2. **Follow each open pull request row.** The pass reads the pull request from GitHub. For each
   commit whose trailer names an attempt of the row's item, it writes an evidence row for that
   attempt and a `boxxy.commit.linked` fact, once per commit. When the pull request has merged or
   closed, the pass moves the row to merged or closed and writes the fact. It sets the row's checked
   time either way.

The merge job's settle records a merge too. Both writers update the row only while it is open, so
the first one moves it and the other skips it, and each merge gets one `boxxy.pull_request.merged`
fact.

Step 1 finds only open pull requests. When the hook's link reaches GitHub, it records a pull request
that has already merged or closed, so the hook covers a pull request that ends before any pass sees
it. When the server returns `retry` to the hook, or the hook never runs, and the pull request merges
or closes before the next pass, boxxy never links it.

## The GitHub adapter

`@boxxy/forge-github` implements the forge port, the `Forge` interface in `@boxxy/model`, on
GitHub's REST API. The pull request hook and the watch read pull requests through it. The merge job
reads the pull request, its base branch's required checks, the checks at its head and its mergeable
state, then merges. The verify gate reads checks and the pull request's description, and a review
round reads the files changed between two heads.

The server calls GitHub at the `github.baseUrl` of its configuration, as the boxxy GitHub App when
it has the App's keys: `BOXXY_GITHUB_APP_CLIENT_ID`, `BOXXY_GITHUB_APP_PRIVATE_KEY` and
`BOXXY_GITHUB_APP_INSTALLATION_ID`. It refuses to start with only some of the keys, or with one it
can't parse, and names the variable, never its value. With the keys, the adapter signs a JWT with
the App's private key, as
[GitHub recommends](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app),
and trades it for an installation token. It keeps the token until `forgeLimits.refreshMarginMs`
before the token expires. A failed trade throws with GitHub's status only, because the failed
request carries the signed JWT, and the next call tries again.

Without the keys, the adapter sends no credential. That suits a server behind a proxy that adds the
GitHub credential to each request on its way out. The server takes no personal token in place of the
App, because a fine-grained token has no `Checks` permission, and GitHub refuses its read of a
private repo's check runs. Without a `github` section, the server builds no adapter. The hook's link
then returns `retry` and the watch never runs. The server also builds no merge worker, so the rules
loader refuses a pipeline with a merge step.

Each adapter call throws when GitHub fails, and its caller treats the throw as "GitHub did not
answer" and tries again later. Three outcomes return a value instead of throwing:

- a pull request read that GitHub doesn't find returns `not-found`;
- a merge whose pull request head has moved returns `head-moved`, because the merge names the head
  whose checks the merge job read, and GitHub merges only that head;
- a merge that GitHub refuses, such as for a conflict, returns `not-mergeable` with GitHub's
  message.

The adapter reads GitHub's own ID of each pull request beside its number, because pepys joins an
attempt to its pull request by that ID ([the join keys](./facts-and-pepys.md#the-join-keys)). It
also reads the base branch, whose required checks the merge job reads.

Each read of a paged list stops at a page cap in `forgeLimits` and keeps the entries it read: the
open pull requests of a repo, the commits of a pull request, and the check runs and commit statuses
at a head. A repo with more open pull requests than the cap can therefore leave a build for step 1
of the watch unlinked. The read of a branch's rules throws past its cap instead, because a rule it
didn't read can be a required check.

For each check name, `readChecks` gives the state of its newest run, and whether that run is a check
run or a commit status. A check run wins over a commit status of the same name. A run that ended
with neither a pass nor a failure, such as `cancelled` or `skipped`, reads `other`.

The owner installs the boxxy App on each repo boxxy works on, with these repository permissions:

| Permission        | Access         | What boxxy reads or writes with it                         |
| ----------------- | -------------- | ---------------------------------------------------------- |
| `Metadata`        | read           | the branch rules and protection behind the required checks |
| `Contents`        | read and write | the changed files, and the merge                           |
| `Pull requests`   | read and write | the pull request reads, the mergeable state, and the merge |
| `Checks`          | read           | the check runs                                             |
| `Commit statuses` | read           | the commit statuses                                        |
