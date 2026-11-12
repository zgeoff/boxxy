<div align="center">
  <h1>@boxxy/cli</h1>

  <p>
    <a href="https://www.npmjs.com/package/@boxxy/cli"><img src="https://img.shields.io/npm/v/@boxxy/cli" alt="npm version"></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  </p>

  <p>
    <a href="../../docs/design/boxxy/README.md">Documentation</a>
  </p>
</div>

The `boxxy` command: one command for each procedure of the boxxy API, the close-out command that an
agent runs inside a session, and the two hooks that bind a session and link its pull request.

## Install

Install the package from [npm](https://www.npmjs.com/package/@boxxy/cli) with Bun:

```bash
bun add @boxxy/cli
```

The package runs on [Bun](https://bun.sh) 1.3 or newer.

An image with no Bun downloads `boxxy-linux-x64`, `boxxy-hook-plugin.tar.gz` and `SHA256SUMS` from
the GitHub release `@boxxy/cli@<version>`, as
[the CLI release assets](../../docs/design/boxxy/release.md#the-cli-release-assets) describes.

## Usage

Set the address of the server, then run a command:

```bash
BOXXY_URL=<server_url> boxxy item list --state ready
```

- `<server_url>` is the origin of the server's owner listener. In a worker session an atc auth
  profile sets it to the broker's address.

`boxxy --help` prints the usage line of every command, and `boxxy --version` prints the version. A
command prints the server's answer as JSON and exits 0, exits 1 on a refusal or an error, and exits
2 on a wrong command line.

## Features

- `boxxy item`, `boxxy relation`, `boxxy defer`, `boxxy expedite`, `boxxy status` and the other
  owner commands.
- `boxxy attempt current`, `boxxy attempt evidence` and `boxxy attempt close-out`, for an agent in a
  session.
- `boxxy hook session-start` and `boxxy hook post-tool-use`, which the plug-in in `hook-plugin/`
  runs.
- `runCLI`, which runs one command line against dependencies the caller passes in.

## Documentation

[The CLI and the hooks](../../docs/design/boxxy/v1-cli.md) lists the environment, the exit codes and
what each hook does.
