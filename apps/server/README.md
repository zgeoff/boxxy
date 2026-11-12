<div align="center">
  <h1>@boxxy/server</h1>

  <p>
    <a href="https://www.npmjs.com/package/@boxxy/server"><img src="https://img.shields.io/npm/v/@boxxy/server" alt="npm version"></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  </p>

  <p>
    <a href="../../docs/design/boxxy/README.md">Documentation</a>
  </p>
</div>

The boxxy server: the API on its owner, worker and public listeners, and the runner tick that claims
tasks, reads sessions and sends the facts to pepys.

`startServer({ env, log })` reads the configuration at `BOXXY_CONFIG`, the trust documents and the
tokens, then starts the listeners, the tick, the pull request watch and the outbox sender. Its
`refused` answer names each missing variable, never a secret value.

## Install

Install the package from npm with [Bun](https://bun.sh) 1.3 or newer:

```bash
bun add @boxxy/server
```

## Usage

Set the configuration path and the tokens, then start the server from the package folder:

```bash
BOXXY_CONFIG=/etc/boxxy/boxxy.json \
BOXXY_WORKER_TOKEN=<worker_token> \
BOXXY_ATC_TOKEN=<atc_token> \
bun run start
```

- `<worker_token>` is the token the broker sends on every request to the worker listener.
- `<atc_token>` is the atc gateway's service token, which the server sends as the bearer.

The `atc` section of the configuration names the gateway:

| Field            | Value                                                              |
| ---------------- | ------------------------------------------------------------------ |
| `url`            | the gateway's MCP endpoint, such as its in-cluster Service address |
| `host`           | optional: the gateway's public host name, sent as `Host`           |
| `trustedFolders` | by worker target, the folders the agent trusts there               |

A git checkout in `rules.folder` loads only a commit that `rules.ref` holds, `origin/main` by
default. A plain folder loads with no check, so build it only from the reviewed rules branch
([rules](../../docs/design/boxxy/rules.md#policy-in-git)). `spawn.repos` gives each repo a folder on
the target, or a git source `{ url, ref, credentialRef? }` that atc clones
([the atc worker](../../docs/design/boxxy/v1-lifecycle.md#the-atc-worker)). With a `pepys` section,
also set `BOXXY_PEPYS_SIGNING_SECRET`. With a `github` section, set `BOXXY_GITHUB_TOKEN` unless a
broker adds the GitHub credential. [Hold notices](../../docs/design/boxxy/owner-notices.md) and
[reviews](../../docs/design/boxxy/review-and-merge.md#the-review-gate) need their own variables.

## Features

- `startServer`, which wires the store, the atc worker, pepys and the listeners.
- `serveApi`, the owner and worker listeners as Elysia apps, for a caller with its own deps.
- `serverConfigSchema`, the configuration file's schema.
- `./test-utils/create-test-server`, the API on in-memory fakes, for tests.

## Documentation

[The API and its auth](../../docs/design/boxxy/v1-api-and-auth.md) sets out the listeners, the
public door and its `publicDoor` configuration, the tokens and which caller may call each procedure.
