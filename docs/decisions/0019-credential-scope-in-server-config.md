# 0019: The server config scopes each credentialed agent

Date: 2026-11-19

## Decision

Some agent sessions need a credential that others must never hold, such as a review session's clone token or a live check's prod credentials for one repo. Each session runs as an atc agent, and atc's broker adds the credentials in that agent's broker profile to the session's outbound calls ([agent sessions](../architecture/work/sessions.md)). The server config decides where each such agent may run. The rules file decides which agent a step uses, through the step's recipe ([recipes](../architecture/work/pipeline.md#recipes-and-skills)).

- The server config's `spawn.agents` lists each agent whose broker profile holds a credential, with the phases it may run and, optionally, the repos. With no `repos`, the agent may run in any repo.
- An agent that `spawn.agents` doesn't list may run any phase in any repo. The operator therefore keeps every credential in a listed agent's profile, because boxxy can't read a broker profile.
- `spawn.phases.<phase>.requireScopedAgent` makes every recipe that can run that phase name an agent listed for it. The review phase sets it, so every review runs on the review agent.
- A live check's agent lists one phase and one repo, such as `{ phases: [live], repos: [example/app] }`, and its broker profile holds only that repo's credentials.
- A repo may name its own recipe for a phase, in the rules file's `repos.<repo>.recipes`.
- The server's rules loader refuses a rules file that would run a listed agent outside its phases or repos. The atc worker checks the same scope before each spawn, so a server config change after the claim can't move a credential either.

## Rejected alternatives

| Option | Why not |
| --- | --- |
| the grant in the rules file, such as a field on a repo's entry | anyone who merges a rules pull request could grant prod credentials, and a rules merge reaches the server with no deploy |
| one live agent that holds every repo's prod credentials | each live session would hold keys to systems its item never touches |
| a second list for live agents, beside the list of review agents | two lists with two checks, for one rule, can come to disagree |
| a credential made for each item | it needs a service that issues credentials, and a way to say what each prod system's credential may do |

## Why

The rules repository changes by pull request and reaches the server within minutes, with no deploy. The server config changes only when the server deploys. A grant in the server config therefore needs a deploy. The choice of which agent a step uses stays in the rules file, where the rules check refuses a pull request that would run an agent outside its scope.
