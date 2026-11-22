<div align="center">
  <h1>@boxxy/auth-oauth</h1>

  <p>
    <a href="https://www.npmjs.com/package/@boxxy/auth-oauth"><img src="https://img.shields.io/npm/v/@boxxy/auth-oauth" alt="npm version"></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  </p>

  <p>
    <a href="../../docs/architecture/overview.md">Documentation</a>
  </p>
</div>

boxxy's public door lets the owner's assistant reach the owner's MCP tools from anywhere, with a
grant that the owner approved with a passkey. The OAuth server is
[`@zgeoff/mcp-auth`](https://www.npmjs.com/package/@zgeoff/mcp-auth); this package opens it on
boxxy's auth database, with boxxy's scopes and table names.

## Install

Install the package from [npm](https://www.npmjs.com/package/@boxxy/auth-oauth) with Bun:

```bash
bun add @boxxy/auth-oauth
```

The package runs on [Bun](https://bun.sh) 1.3 or newer.

## Features

- `createPublicDoor(options)` opens and migrates the auth database and returns the door:
  `answerRequest` for each request, `addLocalPort` for the loopback address, `admin` for the owner's
  commands, `auth` for the test helpers, and `stop`.
- The door serves MCP at `/mcp` and at `/`, the OAuth routes, the two `.well-known` documents and
  the sign-in pages, and answers 404 on any other path.
- It checks the `Host` and `Origin` headers, verifies each bearer token, and passes the verified
  token to the `serveMCP` callback that the app gives it.
- It writes each sign-in outcome and each refused token to `writeSecurityLine` as a JSON line.
- `admin` enrolls a passkey, adds and removes clients, and lists and revokes grants.
- With `serviceTokens`, the door signs in the service clients of a service-token file with the
  `client_credentials` grant. It reads the file again on SIGHUP, and passes each outcome to
  `onReload`: the clients replaced, or the old clients kept with the reason.
- `mintServiceSecret()` draws a service client's secret and its digest, for the file.
- `./test-utils/authorize-test-client` signs a client in through `door.auth` with a stub passkey,
  for tests.

## Documentation

Read [the public door](../../docs/architecture/interfaces/api-and-auth.md#the-public-door) for the
endpoints, the scopes and the token lifetimes, and
[decision 0018](../../docs/decisions/0018-public-owner-mcp.md) for the decision behind it.
