<div align="center">
  <h1>@boxxy/forge-github</h1>

  <p>
    <a href="https://www.npmjs.com/package/@boxxy/forge-github"><img src="https://img.shields.io/npm/v/@boxxy/forge-github" alt="npm version"></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  </p>

  <p>
    <a href="../../docs/design/boxxy/README.md">Documentation</a>
  </p>
</div>

boxxy's `Forge` port on GitHub: over the REST API it reads a pull request, its commits, its body,
its mergeable state and the checks at a head, the open pull requests of a repo, the compare of two
heads and the checks a branch requires, and it merges a pull request at a head.

## Install

Install the package from [npm](https://www.npmjs.com/package/@boxxy/forge-github) with Bun:

```bash
bun add @boxxy/forge-github
```

The package runs on [Bun](https://bun.sh) 1.3 or newer.

## Features

- `createGithubForge({ fetch, baseUrl, readToken? })` returns a `Forge`. The app passes the `fetch`
  and the REST root, such as `https://api.github.com`.
- `readToken` is optional, because a deployment's broker can add the credential on the way out. The
  adapter reads it before each call, sends the token as a bearer token, and never logs it or puts it
  in an error.
- `createGithubAppAuth({ keys, baseUrl, fetch, nowMs })` mints a GitHub App's installation token
  through `@octokit/auth-app`, with the App's client ID as the JWT's `iss`. Its `readToken` holds
  the token until 5 minutes before it expires, and shares one mint between the calls that wait.
- A pull request carries GitHub's own `id`, which pepys builds its entity ID from, and the base
  branch it merges into.
- A missing pull request reads as `not-found`. Any other failure throws, and the caller reads that
  as "the forge did not answer".
- `readChecks(repo, head)` gives the state and the source of the newest run of each check name at
  `head`, from the check runs and the commit statuses.
- `readRequiredChecks(repo, branch)` gives the union of the checks that the branch's rulesets
  require and the checks that its classic protection enforces.
- `mergeAtHead(ref, head, method)` sends one merge call with `sha: head`, so GitHub merges only
  while the head is still `head`. It answers `head-moved` to a 409 and `not-mergeable` to a 405.
- `src/test-utils/github-handlers.ts` holds the MSW handlers that answer the GitHub REST API in
  tests, from `@msw/data` collections that a test seeds, and `build-github-seeders.ts` seeds them
  for the forge contract. The repo's test preload runs `src/test-utils/reset-mock-network.ts`, which
  starts the one mock network of each test process.

## Documentation

[The pull request watch](../../docs/design/boxxy/v1-lifecycle.md#the-pull-request-watch) describes
the calls and the GitHub permissions they need.
