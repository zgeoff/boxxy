# Lookups behind the boxxy pepys package sketch

Four lookups, each with its command and its output. The sketch files in this folder cite them by number.

## 1. A pull request's `id`: REST against the Events API

Question: is the `id` that boxxy reads from `GET /repos/{owner}/{repo}/pulls/{number}` the same number as `pull_request.id` in an event payload?

Commands (a public repository that has nothing to do with boxxy):

```sh
gh api "repos/cli/cli/events?per_page=100" --jq '[.[] | select(.type=="PullRequestEvent")][0] | {number: .payload.pull_request.number, event_id: .payload.pull_request.id}'
gh api repos/cli/cli/pulls/15001 --jq '{rest_id: .id, number: .number}'
```

Output:

```json
{"event_id":5231057656,"number":15001}
{"number":15001,"rest_id":5231057656}
```

What it shows: for one pull request, the REST `id` equals the `pull_request.id` of the Events API payload.
Not checked: a webhook delivery. The Events API payload is not a webhook body. GitHub documents both as the same pull request object. To check it, compare one delivery in the pepys log with one REST read.
Also: the ID is 5,231,057,656, which is above 2^32 and below 2^53.

## 2. atc stamps `atc.session.id`

Command: `git -C <atc checkout> show origin/main:docs/architecture/agents/agent-integration.md` (lines 35 to 58), and `git grep` for `atc.session.id` on the same ref.

What the doc says: atc adds the resource attribute `atc.session.id`, set to the atc session ID, to `OTEL_RESOURCE_ATTRIBUTES` of every agent it starts (a launch, a resume, a headless Claude Code run, a Codex App Server). "Claude Code and Codex copy that variable onto the resource of every log and metric record they export." The ID is "the id the spawn returns". A tool that Claude Code starts (such as `codex exec`) exports the same attribute through a line in the `CLAUDE_ENV_FILE`.

What it is: a statement in atc's doc and one changelog line ("tag each agent's telemetry with its atc session id").
Not checked: that an agent does it. No agent ran for this lookup and no exported record was read. In particular, that Codex copies `OTEL_RESOURCE_ATTRIBUTES` onto its records rests on the doc alone.

## 3. The pepys repo, the pull request entity ID

Command: `git -C <pepys checkout> show origin/main:packages/source-github/src/consumers/github-pull-request.ts`.
Line: ``id: toEntityID(`github:pr:${pullRequest.id}`)``. The ID comes from the webhook's `pull_request.id`. The prefix in that file is `github:pr:`; the boxxy sketches use `github:pull_request:`, the prefix of the pepys v1 design.

## 4. The boxxy repo, the brand schemas

Command: `git -C <boxxy checkout> show origin/main:libs/model/src/rows/brand-schemas.ts`.
`itemId` and `attemptId` are UUID version 7 strings; `atcSessionId` and `agentSessionId` are any string of 1 character or more; `instant` is a non-negative integer; `factId` is `manual:<uuid v7>` in the existing code, and the v1 design makes it a bare UUID version 7 (`../core/04-facts.ts`). Every brand is a zod `.brand()`, with no transform.
`libs/model/package.json` lists `@faker-js/faker` under `dependencies`.
