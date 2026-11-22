<div align="center">
  <h1>@boxxy/caller-proof-imp</h1>

  <p>
    <a href="https://www.npmjs.com/package/@boxxy/caller-proof-imp"><img src="https://img.shields.io/npm/v/@boxxy/caller-proof-imp" alt="npm version"></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  </p>

  <p>
    <a href="../../docs/architecture/overview.md">Documentation</a>
  </p>
</div>

boxxy's `CallerProof` port on the imp broker's identity token: it proves which machine sent a
session's call to the boxxy server.

## Install

Install the package from [npm](https://www.npmjs.com/package/@boxxy/caller-proof-imp) with Bun:

```bash
bun add @boxxy/caller-proof-imp
```

The package runs on [Bun](https://bun.sh) 1.3 or newer.

## Features

- `impIdentityCallerProof({ issuers, audience, clock })` returns a `CallerProof`. Pass it the trust
  documents as parsed JSON, the audience that the broker signs for, and the clock.
- The proof reads the `imp-identity` header and verifies it with `@impz/client/identity`. It gives
  the token's issuer, and the machine ID as the subject.
- The proof proves no caller when the token is missing, expired or forged, signed for another
  audience, or from an unknown issuer. With no trust document, it proves no request.
- `impIdentityCallerProof` throws on a bad trust document, so the server does not start.

## Documentation

Read [The proven caller](../../docs/architecture/interfaces/api-and-auth.md#the-proven-caller) for
how the server uses the proof, and why the adapter makes no session check of its own.
