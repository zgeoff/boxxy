<div align="center">
  <h1>@boxxy/rules</h1>

  <p>
    <a href="https://www.npmjs.com/package/@boxxy/rules"><img src="https://img.shields.io/npm/v/@boxxy/rules" alt="npm version"></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  </p>

  <p>
    <a href="../../docs/design/boxxy/README.md">Documentation</a>
  </p>
</div>

boxxy's rules loader. `loadRules` checks a rules checkout's `rules.yaml` against the concepts boxxy
compiles in, builds the plug-in registry, and gives the loaded rules a version.

The package does no I/O: the caller reads the checkout and passes in its commit hash and its files'
bytes.

## Install

Install the package from [npm](https://www.npmjs.com/package/@boxxy/rules) with Bun:

```bash
bun add @boxxy/rules
```

The package runs on [Bun](https://bun.sh) 1.3 or newer.

## Features

- `loadRules`, which returns the loaded rules, or every rejection with its file, its path in the
  file and its reason ([rules for slice 1](../../docs/design/boxxy/slice-1.md#rules-for-slice-1)).
- The rules version, a content hash of the commit, the files the loader read and each concept pin
  ([the rules version](../../docs/design/boxxy/rules.md#the-rules-version)).

## Documentation

The [rules design](../../docs/design/boxxy/rules.md) says why rules live in git, and
[`01-registries.ts`](../../docs/design/boxxy/sketches/01-registries.ts) gives the shape of the
loaded rules.
