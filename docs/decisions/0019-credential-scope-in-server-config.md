# 0019: The server config scopes each credentialed agent

Date: 2026-11-19

## Decision

A credential reaches an agent session only through an atc agent whose broker profile holds it. The server config's `spawn.agents` lists each such agent with the phases, and optionally the repos, it may run. The rules file picks an agent through a recipe, and a repo can replace a kind's recipe for one phase with `repos.<repo>.recipes`. The rules loader refuses a rules file that would run a listed agent outside its scope, and the atc worker checks the scope again before each spawn. [Verify and live phases](../design/boxxy/verify-and-live.md#who-holds-a-credential) holds the rules.

- `spawn.agents` replaces `spawn.reviewAgents`. The review agent becomes `{ phases: [review] }`, and `spawn.phases.review.requireScopedAgent` keeps the rule that every review runs on it.
- A live agent covers one repo, such as `{ phases: [live], repos: [example/app] }`, and its broker profile reads only that repo's credentials.

## Rejected alternatives

| Option | Why not |
| --- | --- |
| a credential grant in the rules file, such as a field on a repo's entry | a rules pull request could grant itself prod credentials, and the rules repo changes on a merge with no deploy |
| one live agent that holds every repo's prod credentials | each live session would hold keys to systems its item never touches |
| `spawn.repoAgents` beside `spawn.reviewAgents` | two lists and two checks for one rule, which drift apart |
| a credential minted per item | it needs a mint service and a scope language for each prod system |

## Why

The rules repo changes by pull request and reaches the server within minutes, with no deploy. The server config changes only with a deploy of the server. A grant in the server config therefore needs the deploy, while the choice of recipe and agent stays a rules change that the dry run and the rules check cover.
