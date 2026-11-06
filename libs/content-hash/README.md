<div align="center">
  <h1>@boxxy/content-hash</h1>

  <p>
    <a href="https://www.npmjs.com/package/@boxxy/content-hash"><img src="https://img.shields.io/npm/v/@boxxy/content-hash" alt="npm version"></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  </p>

  <p>
    <a href="../../docs/design/boxxy/README.md">Documentation</a>
  </p>
</div>

Canonical JSON and the SHA-256 content hashes boxxy records.

boxxy stores a content hash beside each recipe, rules version and snapshot. A value hashes the same
whatever the order of its object keys.

## Install

Install the package from [npm](https://www.npmjs.com/package/@boxxy/content-hash) with Bun:

```bash
bun add @boxxy/content-hash
```

The package runs on [Bun](https://bun.sh) 1.3 or newer.

## Features

- `formatCanonicalJson`, which writes a JSON value in the canonical form of
  [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785).
- `contentHash`, the SHA-256 hex of a value's canonical JSON, as a branded `ContentHash`.
- `hashBytes`, the SHA-256 hex of a file's bytes.
- `hashTree`, the content hash of a folder's files, whatever order the caller walks them in.

## Documentation

The [first build spec](../../docs/design/boxxy/slice-1.md#packages) lists the hashes boxxy records.
