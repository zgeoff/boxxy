<div align="center">
  <h1>@boxxy/prompt-template</h1>

  <p>
    <a href="https://www.npmjs.com/package/@boxxy/prompt-template"><img src="https://img.shields.io/npm/v/@boxxy/prompt-template" alt="npm version"></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  </p>

  <p>
    <a href="../../docs/design/boxxy/README.md">Documentation</a>
  </p>
</div>

The launch prompt template of a boxxy recipe: its placeholders, its load check and its render.

A recipe's prompt is a [Liquid](https://liquidjs.com/) template. The rules loader checks each
template when it loads the rules, and dispatch renders it when it claims an attempt.

## Install

Install the package from [npm](https://www.npmjs.com/package/@boxxy/prompt-template) with Bun:

```bash
bun add @boxxy/prompt-template
```

The package runs on [Bun](https://bun.sh) 1.3 or newer.

## Features

- `promptPlaceholders`, the names a template may use.
- `findPromptTemplateFault`, which returns why a template cannot render, or `null` when it can.
- `renderPromptTemplate`, which renders a template with a value for each placeholder.

## Documentation

[The launch prompt](../../docs/design/boxxy/v1.md#the-launch-prompt) lists the placeholders and
their values.
