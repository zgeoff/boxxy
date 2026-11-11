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

The boxxy server: the API on its owner and worker listeners, and the runner tick that claims tasks,
reads sessions and sends the facts to pepys.

`startServer({ env, log })` reads the configuration file at `BOXXY_CONFIG`, the trust documents and
the tokens from the environment, then starts both listeners, the tick, the pull request watch and
the outbox sender. It answers `refused` with a message that names each missing variable and never a
secret value.

## Install

Install the package from [npm](https://www.npmjs.com/package/@boxxy/server) with Bun:

```bash
bun add @boxxy/server
```

The package runs on [Bun](https://bun.sh) 1.3 or newer.

## Usage

Set the configuration path and the tokens, then start the server from the package folder:

```bash
BOXXY_CONFIG=/etc/boxxy/boxxy.json \
BOXXY_WORKER_TOKEN=<worker_token> \
BOXXY_ATC_TOKEN=<atc_token> \
bun run start
```

- `<worker_token>` is the token the broker sends on every request to the worker listener.
- `<atc_token>` is the token the server sends to the atc daemon.

With a `pepys` section in the configuration, also set `BOXXY_PEPYS_SIGNING_SECRET`. With a `github`
section, set `BOXXY_GITHUB_TOKEN` unless a broker adds the GitHub credential.

## Features

- `startServer`, which wires the store, the atc worker and notifier, pepys and both listeners.
- `serveApi`, the two listeners as Elysia apps, for a caller that builds its own dependencies.
- `serverConfigSchema`, the configuration file's schema.
- `./test-utils/create-test-server`, the API on in-memory fakes, for tests.

## Documentation

[The API and its auth](../../docs/design/boxxy/v1-api-and-auth.md) sets out the listeners, the
tokens and which caller may call each procedure.
