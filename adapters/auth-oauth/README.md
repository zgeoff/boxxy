<div align="center">
  <h1>@boxxy/auth-oauth</h1>

  <p>
    <a href="https://www.npmjs.com/package/@boxxy/auth-oauth"><img src="https://img.shields.io/npm/v/@boxxy/auth-oauth" alt="npm version"></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  </p>

  <p>
    <a href="../../docs/design/boxxy/README.md">Documentation</a>
  </p>
</div>

The OAuth server behind boxxy's public door: it lets the owner's assistant reach the owner's MCP
tools from anywhere, with a grant that the owner approved with a passkey.

## Install

Install the package from [npm](https://www.npmjs.com/package/@boxxy/auth-oauth) with Bun:

```bash
bun add @boxxy/auth-oauth
```

The package runs on [Bun](https://bun.sh) 1.3 or newer.

## Features

- `createPublicDoor(options)` opens the auth database and returns the door: `answerRequest` for each
  request, `addLocalPort` for the loopback address, `admin` for the owner's commands and `stop`.
- The door serves `/mcp`, the OAuth routes (`/oauth2/authorize`, `/oauth2/token`, `/oauth2/revoke`
  and the two `.well-known` documents) and the sign-in pages (`/login`, `/enroll`, `/consent`,
  `/error`), and answers 404 on any other path.
- It checks the `Host` and `Origin` headers, verifies each bearer token against the auth database,
  and passes the verified token to the `serveMCP` callback that the app gives it.
- It writes each sign-in outcome and each refused token to `writeSecurityLine` as a JSON line.
- `admin` enrolls a passkey, adds and removes clients, and lists and revokes grants.
- `./test-utils/authorize-test-client` runs the whole sign-in against a door with a stub passkey,
  for tests.

The code is a copy of the OAuth server in atc's `@atc/mcp`. Each copied file names its source path
and commit in its first line.

## Documentation

[The public door](../../docs/design/boxxy/v1-api-and-auth.md#the-public-door) describes the
endpoints, the scopes and the token lifetimes, and
[0018](../../docs/decisions/0018-public-owner-mcp.md) records the decision.
