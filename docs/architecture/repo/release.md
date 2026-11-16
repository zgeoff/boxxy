# How boxxy ships

boxxy ships as `@boxxy/*` packages on npm, and every package carries the same version. A deployment
in another repo never builds from this repo: it installs the packages from npm at one version, takes
the compiled CLI from the CLI's GitHub release, and builds its images from them. CI publishes each
version from a release tag with npm provenance. The
[Release section of the tech stack](./tech-stack.md#release) gives the CI flow, and the
[releasing runbook](../../runbooks/releasing.md) gives the steps a maintainer takes.
[The overview](../overview.md#terms) defines the terms this doc uses, such as pepys.

Two workflows run the publish code. The publish run is the `main.yml` run that the release
dispatches at its tag: its `publish` job publishes to npm, and its `cli-assets` job attaches the CLI
release assets. The rehearsal is the `npm packages` workflow: on every pull request that touches a
package, it runs the same build and checks as the publish run, and publishes and uploads nothing.

## The packages

Every package folder under `apps/`, `modules/`, `adapters/`, `libs/` and `packages/` publishes as
`@boxxy/<folder>`, unless its `package.json` sets `"private": true`. Each public package ships its
TypeScript source, its declarations in `dist/`, its README and the license, with
`publishConfig.access` set to `public`.

A deployment installs these:

| What it builds       | Packages it installs                                                                   |
| -------------------- | -------------------------------------------------------------------------------------- |
| the server image     | `@boxxy/server`, and each `@boxxy/*` package the server depends on                     |
| the pepys deployment | `@boxxy/pepys` and its dependency `@boxxy/model`                                       |
| the agent image      | no package: the files that the [CLI's GitHub release](#the-cli-release-assets) carries |

`@boxxy/pepys` is boxxy's plug-in for pepys: the code a pepys deployment loads to build boxxy's
tables, as [facts and pepys](../interfaces/facts-and-pepys.md#the-boxxy_work-package) describes. It
lists `@pepys/kit` and `zod` as required peer dependencies, so the plug-in uses the deployment's own
copy of each. Its other `@pepys/*` peers are optional, for its test helpers. Each `@pepys/*` peer
range is a caret range on the pepys minor version that boxxy builds against, so a deployment can
take any patch release of that minor version.

Inside this repo, the `catalog` in the root `package.json` pins every `@pepys/*` package that boxxy
installs to one exact npm version. The dev dependencies of `@boxxy/pepys` take their versions from
that catalog.

The publish run refuses to publish a package whose tarball would break on install. It packs each
package, reads the tarball's file list, and stops before `npm publish` in two cases:

- an `exports` target has no packed file;
- a packed `src` file imports a bare name that no `dependencies`, `peerDependencies` or
  `optionalDependencies` field lists. `bun` and the `node:` and `bun:` modules count as listed.

The rehearsal makes both checks on every package, so a pull request finds the fault before a
release.

A `src/test-utils/` folder ships and is exported with its package, so a user of the package can call
its test helpers. A helper may import a package that only its users need. The package then lists
that import twice: as an optional peer dependency, so a user installs it only to use the helper, and
as a dev dependency, so the workspace has it for the package's own tests. `@boxxy/pepys`, for
example, lists the pepys test and ingest packages as optional peers, for its helpers that start a
pepys inside a test. When the optional peer is another `@boxxy/*` package, its range is
`workspace:*`, and the pack writes the release's exact version in its place.

## The CLI release assets

An agent image runs no package manager: its build downloads pinned files and checks their SHA-256.
So each release of `@boxxy/cli` attaches three files to its GitHub release, `@boxxy/cli@<version>`:

| Asset                      | What it holds                                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `boxxy-linux-x64`          | The CLI, compiled by Bun into one Linux binary                                                             |
| `boxxy-hook-plugin.tar.gz` | The [hook plug-in](../interfaces/cli-and-hooks.md#the-hook-plug-in), under one top folder, `hook-plugin/`. |
| `SHA256SUMS`               | One `sha256sum` line for each of the other two                                                             |

The binary carries its own Bun runtime, so the image needs no Bun. The image installs it as `boxxy`
on the `PATH`, because the hooks call `boxxy`.

A consumer checks the files of a version, `<version>`, like this:

```bash
gh release download '@boxxy/cli@<version>' --repo zgeoff/boxxy -p boxxy-linux-x64 -p boxxy-hook-plugin.tar.gz -p SHA256SUMS
sha256sum -c SHA256SUMS
```

A Dockerfile pins the checksum of each file from that release's `SHA256SUMS`.

The `cli-assets` job builds the files from the tagged commit, with the pinned Bun and the frozen
lockfile. Before the upload, it runs the binary to check that it starts, prints its version and
usage, and refuses a hook call with no server URL. Then it checks the files against `SHA256SUMS`.
`scripts/publish/release-cli-assets.ts` holds the steps and the expected output. The rehearsal runs
the same build and checks.

Once a release holds a complete set, the job never replaces it, because an image may already pin its
checksums. Bun does not promise the same bytes from two compiles of one commit, so a rebuilt binary
would break every pin. The job decides from the state of `SHA256SUMS` in the release:

- It uploads `SHA256SUMS` last. A complete set has a `SHA256SUMS` that GitHub marks as uploaded,
  with a size above zero, and the job skips that release.
- Any other release gets all three files again, with `--clobber`. One case is an upload that failed
  halfway: GitHub keeps an asset whose upload failed in the state `starter`.
- release-please creates the GitHub release when it tags the release. When the tag
  `@boxxy/cli@<version>` has no GitHub release, the job fails and creates none.
- When the run's checkout is not the commit of that tag, such as a dispatch by hand at `main`, the
  job fails before the build. The upload tag comes from the version in `package.json`, and a later
  commit can hold the same version.

A republish is a run that a maintainer dispatches at a release tag after a failed publish. It runs
the `main.yml` that the tag's commit holds. The
[releasing runbook](../../runbooks/releasing.md#republish-a-release-that-failed-to-publish) gives
the steps.

## One version for every package

`release-please-config.json` puts every package in one `linked-versions` group, `boxxy`. When a
release holds a change to any package, release-please gives every package in the group the highest
version among them. It releases each package at that version, including a package with no change.
Each release still gets its own tag, `@boxxy/<folder>@<version>`, and every tag of one release sits
on the same merge commit.

The config's `plugins` list holds two plugins: `node-workspace` first, with `"merge": false`, then
`linked-versions`. release-please needs this order to link versions in a workspace. Either plugin
can combine the packages' release changes into the one release pull request. The `linked-versions`
group must do it, because it needs every package at once to give them one version. So
`node-workspace` only updates the `@boxxy/*` dependency ranges and leaves the combining to the
group.

A new package joins the group with two lines in `release-please-config.json`: its entry under
`packages`, and its component name in the group's `components`. A private package needs both lines
too. `release-please-config.test.ts` fails while any package folder has no entry or its component is
missing from the group.

Before version 1.0, a breaking change raises the minor version and any other releasable change
raises the patch version (`bump-minor-pre-major`, `bump-patch-for-minor-pre-major`).

## The first publish of a new name

A trusted publisher is a setting on an npm package that names the repo and the workflow allowed to
publish it, so CI publishes with no npm token. npm adds a trusted publisher only to a package that
is already on the registry. So a maintainer publishes each new name once by hand, as a placeholder,
and CI publishes every real version.

npm also expires a trusted publisher that no publish uses within a short window after it is added.
The [releasing runbook](../../runbooks/releasing.md#publish-a-new-package) gives the window and the
commands. So the maintainer adds the trusted publisher only when a release pull request that
releases the package is ready to merge:

1. A maintainer with two-factor authentication on the `@boxxy` npm org publishes version `0.0.1` of
   the name from their own machine. The placeholder holds no code: only a `package.json` with the
   name, the license and the `repository` field, a README that says it is a placeholder, and the
   license file. It is built outside the repo's package folders, so it can reserve a name before the
   package's code is on `main`.
2. When the release pull request is ready to merge, the maintainer adds a trusted publisher to the
   name. The trusted publisher names this repo and `main.yml`, and allows npm publish.
3. The release publishes the package's first real version from CI, with provenance. That version is
   above `0.0.1`, because `initial-version` is `0.1.0` and the group version is at least that.

## What a deployment pins

A deployment pins every `@boxxy/*` line of its `package.json` to one exact version, and its lockfile
to the same. Its agent image pins the CLI release assets of that version, each by its checksum.

To upgrade, the deployment's maintainer or its automation reads the `latest` version of
`@boxxy/server` on npm, and moves every `@boxxy/*` line to that version in one change. Because every
package shares the version, that one read is enough: no package of a release can sit at another
version.

The deployment also pins `@pepys/kit` to a version in the peer range of `@boxxy/pepys`. When pepys
publishes a new minor version, a boxxy maintainer moves the `@pepys/*` lines of the catalog to it,
runs `bun run glue` in `packages/pepys` to rewrite the generated glue code, moves the peer ranges to
the new minor version, and releases. The deployment then moves its `@boxxy/*` and `@pepys/kit` pins
together.
