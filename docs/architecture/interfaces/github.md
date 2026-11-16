# GitHub

boxxy makes every GitHub call through one adapter. With it, boxxy links each build attempt, an
attempt at the build phase, to the pull request that its agent opened, and records when that pull
request merges or closes. The merge step and the review also call GitHub through the adapter.

Two paths link a pull request. The pull request hook in the agent's session links it as soon as the
agent opens it. A watch that the server runs on a timer links each pull request that the hook
missed, and records merges and closes.

[The overview](../overview.md#terms) defines the terms this doc uses, such as item, attempt, settle,
job, fact, proven caller and forge. [Attempts](../work/attempts.md) covers attempts, their leases
and the settle. [The CLI and the hooks](./cli-and-hooks.md#the-pull-request-hook) covers the hook
that sends the pull request URL, and what it does with each answer.
[Facts and pepys](./facts-and-pepys.md) covers the facts that a link and a merge send.

## Linking a pull request

The hook and the watch write a link the same way. In one transaction of the
[boxxy store](../overview.md#the-data), the server writes:

- the pull request row, which the watch later reads to follow the pull request;
- an evidence row, an entry in the build attempt's evidence list that ties the pull request's URL to
  the attempt, the same list that a close-out cites;
- the `boxxy.pull_request.linked` fact.

The evidence row and the fact record which path made the link, `hook` or `watch`. The watch follows
only open rows. When GitHub already shows the pull request merged or closed, the server therefore
stores the row as merged or closed in the same transaction, and writes `boxxy.pull_request.merged`
or `boxxy.pull_request.closed`.

The server writes no attempt row for a link, so a link never takes the attempt's lease and never
races the settle. The two paths make sure that the link goes to the right attempt in different ways.
The watch links only a build attempt that has already settled as succeeded. The hook links while the
attempt is still live, so the server checks the calling session on each hook call.

### The hook's call

The hook sends the URL that `gh pr create` printed. The server first checks that the call comes from
the current attempt of the calling session, as
[Close-outs and their limits](../work/attempts.md#close-outs-and-their-limits) describes. The
current attempt is the session's latest attempt, and its row must hold the
[proven caller](./api-and-auth.md#the-proven-caller). The server then reads the pull request from
GitHub. A newer attempt can take over the session while GitHub answers, so the server checks the
session again before it writes, inside the store's write lock, which runs one change at a time. That
second check refuses the old attempt's link.

The server compares the URL's repo with the item's repo ignoring upper and lower case, as GitHub
does. It stores the item's spelling, so every row and fact of a repo has one key.

Only a `linked` answer without `repeat` writes a link. Every other answer writes nothing:

| Answer                              | When                                                                                                            |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `linked`                            | GitHub knows the pull request, and no attempt has linked it yet                                                 |
| `linked`, with `repeat: true`       | an attempt of the same item already linked this pull request                                                    |
| `retry`                             | the GitHub call fails, GitHub doesn't find the pull request yet, or the server's config has no `github` section |
| `refused`, `not-a-pull-request-url` | the URL names no pull request, or a pull request in a repo other than the item's                                |
| `refused`, `linked-elsewhere`       | an attempt of another item already linked this pull request                                                     |
| `refused`, `not-current`            | the call names an attempt that isn't the session's latest, at either check                                      |
| `refused`, `no-attempt`             | the session has no attempt, or its latest attempt doesn't hold the proven caller, at either check               |

After a `retry`, the watch links the pull request on a later pass, with these exceptions:

- When the server's config has no `github` section, the watch never runs.
- The watch finds only open pull requests. When the pull request merges or closes before the next
  pass, boxxy never links it.
- The watch finds a pull request only when one of its commits carries the build attempt's
  `Boxxy-Attempt` trailer ([the pull request watch](#the-pull-request-watch)).

## The pull request watch

The server runs a pass of the watch every `watchMs`, set in `start-server.ts`, when the server's
config has a `github` section. When a GitHub call throws, the pass writes nothing for that call and
adds one to its `unanswered` count. The server logs a warning for a pass with any unanswered call,
and the next pass makes the call again.

1. **Link what the hook missed.** The pass picks each succeeded build attempt that has no pull
   request row. For each repo of those build attempts, it lists the repo's open pull requests and
   reads each one. It links a build attempt to the first pull request that holds a commit whose
   `Boxxy-Attempt: <attempt_id>` trailer names that build attempt. It skips a build attempt whose
   item already has an open pull request row. It also skips a build attempt that ended longer ago
   than `watchLimits.linkWindowMs`, so a build attempt that opened no pull request stops costing
   GitHub calls.
2. **Follow each open pull request row.** The pass reads the pull request from GitHub. For each
   commit whose trailer names an attempt of the row's item, it writes an evidence row for that
   attempt and a `boxxy.commit.linked` fact, once per commit. When the pull request has merged or
   closed, the pass moves the row to merged or closed and writes `boxxy.pull_request.merged` or
   `boxxy.pull_request.closed`. It sets the row's checked time either way.

boxxy never writes the trailer itself. An agent adds it to a commit message only when its recipe's
prompt template asks for it, with the `{{ attempt_id }}` value
([the launch prompt](../work/pipeline.md#the-launch-prompt)). The example build prompt doesn't ask
for it. Without the trailer, only the hook can link a build attempt's pull request.

The merge job's settle records a merge too. The settle and the watch each update the row only while
it is open, so the first one moves it and the other skips it, and each merge gets one
`boxxy.pull_request.merged` fact.

## The GitHub adapter

`@boxxy/forge-github` implements the forge port, the `Forge` interface in `@boxxy/model`, on
GitHub's REST API. The hook, the watch, the merge job and a review's close-out call it:

- The hook and the watch read pull requests ([linking a pull request](#linking-a-pull-request)).
- The merge job reads checks and merges
  ([the merge step](../../design/boxxy/review-and-merge.md#the-merge-step)). It also reads the
  verify gate's check and report through the `Verifier` port
  ([the `Verifier` reading](../repo/verify-journeys.md#the-verifier-reading)).
- A review's close-out reads the files changed since the previous review
  ([the review](../work/pipeline.md#the-review)).

The server calls GitHub at the `github.baseUrl` of its config, as the boxxy GitHub App when it has
the App's keys: `BOXXY_GITHUB_APP_CLIENT_ID`, `BOXXY_GITHUB_APP_PRIVATE_KEY` and
`BOXXY_GITHUB_APP_INSTALLATION_ID`. It refuses to start with only some of the keys, or with one it
can't parse, and names the variable, never its value. With the keys, the adapter signs a JWT with
the App's private key, as
[GitHub recommends](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app),
and trades it for an installation token. It keeps the token until `forgeLimits.refreshMarginMs`
before the token expires. The request of a trade carries the signed JWT, so when a trade fails, the
adapter throws an error that holds GitHub's status and leaves the request out. The next call tries
the trade again.

Without the keys, the adapter sends no credential. That suits a server behind a proxy that adds the
GitHub credential to each request on its way out. The server takes no personal token in place of the
App, because a fine-grained token has no `Checks` permission, and GitHub refuses its read of a
private repo's check runs.

Without a `github` section, the server builds no adapter. The hook's link then returns `retry` and
the watch never runs. The server also builds no merge job worker, so the loader refuses a rules file
with a merge step ([rules of the engine](../work/pipeline.md#rules-of-the-engine)).

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

The adapter reads each paged list up to a page cap in `forgeLimits`, and keeps the entries it read:
the open pull requests of a repo, the commits of a pull request, and the check runs and commit
statuses at a head. A page holds `forgeLimits.pageSize` entries. When a repo has more open pull
requests than `forgeLimits.maxListPages` pages hold, step 1 of the watch never sees the rest, and
can leave a build attempt unlinked. The read of a branch's rules throws past its cap instead,
because a rule it didn't read can be a required check.

For each check name, `readChecks` gives the state of its newest run, and whether that run is a check
run or a commit status. A check run wins over a commit status of the same name. `readChecks` gives
`other` for a run that ended with neither a pass nor a failure, such as `cancelled` or `skipped`.

The owner installs the boxxy App on each repo boxxy works on, with these repository permissions:

| Permission        | Access         | What boxxy reads or writes with it                         |
| ----------------- | -------------- | ---------------------------------------------------------- |
| `Metadata`        | read           | the branch rules and protection behind the required checks |
| `Contents`        | read and write | the changed files, and the merge                           |
| `Pull requests`   | read and write | the pull request reads, the mergeable state, and the merge |
| `Checks`          | read           | the check runs                                             |
| `Commit statuses` | read           | the commit statuses                                        |
