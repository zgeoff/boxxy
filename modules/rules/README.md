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

boxxy's rules loader. `loadRules` checks a rules checkout's `rules.yaml` against the concepts and
the phase kinds boxxy compiles in, builds the plug-in registry, and gives the loaded rules a
version. [`example/`](./example/) holds the v1 rules file and its prompts.

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
  file and its reason ([the pipeline](../../docs/design/boxxy/v1.md#the-pipeline)).
- The rules version, a content hash of the commit, the files the loader read, each concept pin and
  each phase kind ([the rules version](../../docs/design/boxxy/rules.md#the-rules-version)).

## Documentation

The [rules design](../../docs/design/boxxy/rules.md) says why rules live in git, and
[`02-types.ts`](../../docs/design/boxxy/sketches/v1/core/02-types.ts) gives the shape of the loaded
rules.
