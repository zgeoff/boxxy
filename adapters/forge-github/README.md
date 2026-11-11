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

boxxy's `Forge` port on GitHub: it reads a pull request, its commits and the open pull requests of a
repo over the REST API.

## Install

Install the package from [npm](https://www.npmjs.com/package/@boxxy/forge-github) with Bun:

```bash
bun add @boxxy/forge-github
```

The package runs on [Bun](https://bun.sh) 1.3 or newer.

## Features

- `createGithubForge({ fetch, baseUrl, token? })` returns a `Forge`. The app passes the `fetch` and
  the REST root, such as `https://api.github.com`.
- The `token` is optional, because a deployment's broker can add the credential on the way out. The
  adapter sends it as a bearer token, and never logs it or puts it in an error.
- A pull request carries GitHub's own `id`, which pepys builds its entity ID from.
- A missing pull request reads as `not-found`. Any other failure throws, and the caller reads that
  as "the forge did not answer".

## Documentation

[The pull request watch](../../docs/design/boxxy/v1-lifecycle.md#the-pull-request-watch) describes
the calls and the GitHub permissions they need.
