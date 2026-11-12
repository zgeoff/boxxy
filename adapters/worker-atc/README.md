<div align="center">
  <h1>@boxxy/worker-atc</h1>

  <p>
    <a href="https://www.npmjs.com/package/@boxxy/worker-atc"><img src="https://img.shields.io/npm/v/@boxxy/worker-atc" alt="npm version"></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  </p>

  <p>
    <a href="../../docs/design/boxxy/README.md">Documentation</a>
  </p>
</div>

boxxy's worker port on atc: it starts, reads, sleeps, wakes, stops and forgets the agent sessions
that run boxxy's attempts.

`createAtcWorker({ client, trustedFolders })` takes an atc client and the folders the agent trusts
on each worker target. `createAtcMcpClient({ url, host, token, fetch, timeoutMs })` builds the
client on the atc gateway's MCP endpoint. It is the only package that imports
`@modelcontextprotocol/client`.

## Install

Install the package from [npm](https://www.npmjs.com/package/@boxxy/worker-atc) with Bun:

```bash
bun add @boxxy/worker-atc
```

The package runs on [Bun](https://bun.sh) 1.3 or newer.

## Features

- `createAtcWorker`, the `WorkerKind` port of `@boxxy/model` on atc's MCP tools.
- `createAtcMcpClient`, the `AtcClient` over MCP streamable HTTP, with each tool result parsed by a
  schema.
- `AtcCallError`, the error of a call that atc refused, with atc's `code`.
- `./test-utils/create-fake-atc`, an atc daemon in memory, and
  `./test-utils/create-fake-atc-server`, the gateway's `/mcp` endpoint in process in front of it,
  for tests.

## Documentation

[The atc worker](../../docs/design/boxxy/v1-lifecycle.md#the-atc-worker) in the attempt lifecycle
maps each port method to its atc call, and each atc answer to the port's outcome.
