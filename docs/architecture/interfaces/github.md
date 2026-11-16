# GitHub

boxxy reads GitHub to link each attempt to the pull request it opened, and to record when that pull
request merges. The hook in a session links a pull request as soon as the agent opens it, and a
watch on the runner links what the hook missed. One adapter holds every GitHub call.

[Attempts](../work/attempts.md) covers the build attempt whose pull request this links.
[The CLI and the hooks](./cli-and-hooks.md) covers the hook that links a pull request from the
session.

## The pull request watch

`linkPullRequest` is the hook's link, and `watchPullRequests` is one pass of the watch. Both write
the pull request row, the evidence row and the facts in one change, and both write with no lease,
because a succeeded build has released its lease.

**The hook's link.** It takes the hook's call and the URL that the hook read from `gh pr create`. It
runs `pickCallAttempt` before the forge read and again in the write's lock, because a newer attempt
can take the session while the forge answers. It matches the URL's repo to the item's in any case,
as GitHub does, and keys the rows and facts by the item's spelling of the repo. It answers in one of
these ways:

- `linked`, with `repeat: true` and no write when a pull request of the same item is already linked;
- `retry`, with no write, when the forge throws or does not know the pull request yet. The watch
  links it later;
- `refused`, with the reason `not-a-pull-request-url` for a URL that names no pull request or one of
  another repo than the item's, `linked-elsewhere` for a pull request linked to another item, and
  `no-attempt` or `not-current` when the call names no current attempt of its session at either
  check.

A pull request that the forge already shows merged or closed gets its `boxxy.pull_request.merged` or
`.closed` fact in the same change, because the watch reads only open rows.

**One pass of the watch.** The server runs it every `watchMs` (in `@boxxy/server`'s
`start-server.ts`). A forge call that throws counts in `unanswered`, writes nothing, and the next
pass tries it again.

1. For each repo with a succeeded build that has no pull request, the pass lists the open pull
   requests. It reads each one, and links the first whose commit carries the build's `Boxxy-Attempt`
   trailer, with source `watch`. It skips a build whose item has an open pull request, and a build
   that ended longer ago than `watchLimits.linkWindowMs` in `@boxxy/dispatch`.
2. For each open pull request row, the pass reads the forge. It links each commit whose trailer
   names an attempt of the same item, once per commit. It records a merge or a close, and sets the
   checked time. The settle of a merge attempt records the merge too, and each writer skips a row
   that is no longer open, so a merge gets one `boxxy.pull_request.merged` fact.

A pull request that merged before the watch ever listed it is not found by step 1. The hook's link
covers it, because the link reads a merged pull request at once.

## The GitHub adapter

`@boxxy/forge-github` implements the forge port on GitHub's REST API with `fetch`, a REST root and
an optional token source, which the adapter reads before each call. The server builds the adapter
from the `github.baseUrl` of its configuration and the boxxy GitHub App's keys:
`BOXXY_GITHUB_APP_CLIENT_ID`, `BOXXY_GITHUB_APP_PRIVATE_KEY` and `BOXXY_GITHUB_APP_INSTALLATION_ID`.
The server takes all three or none, and refuses to start with only some, naming each missing
variable and never its value. It also refuses to start on a client ID with white space, an
installation ID that isn't a safe positive integer, or a private key that Node can't parse as an RSA
key in PEM form, and names the variable.

With the keys, the adapter signs an RS256 JWT with the client ID as `iss`, as
[GitHub recommends](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app),
and trades it for the installation token, which it holds until `forgeLimits.refreshMarginMs` before
the token expires. A failed mint throws with GitHub's status only, and the next call mints again.
With no keys, the adapter sends no credential, for a broker that adds it on the way out. A
fine-grained token can't stand in for the App, because it has no `Checks` permission and gets 403 on
a private repo's check runs. With no `github` section, the hook's link answers `retry` and no watch
runs.

The adapter reads GitHub's own `id` of the pull request, and its base branch from `base.ref`. A 404
for a pull request read reads as `not-found`. The merge at a head reads GitHub's 409 as
`head-moved`, and its 405 as `not-mergeable` with GitHub's message as the reason. Every other
failure throws.

The adapter reads at most 2,000 open pull requests of a repo, 250 commits of a pull request, and 300
check runs and 300 commit statuses at a head. The read of a branch's required checks throws for a
branch with more than 300 rules, because a rule past the limit can be a required check. The checks
read gives each check name the state of its newest run and its source, a check run or a commit
status. A check run wins over a commit status of the same name. A run that ended with no pass and no
failure, such as `cancelled` or `skipped`, reads `other`.

The owner installs the boxxy App on each repo boxxy works on, with these repository permissions:

- `Metadata: read`, for the branch rules and protection behind the required checks;
- `Contents: read and write`, for the changed files and the merge;
- `Pull requests: read and write`, for the pull request reads, the mergeable read and the merge;
- `Checks: read` and `Commit statuses: read`, for the checks read.
