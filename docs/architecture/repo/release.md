# How boxxy ships

boxxy ships as `@boxxy/*` packages on npm, and every package carries the same version. A deployment
in another repo never builds from this repo: it installs the packages from npm at one version, takes
the compiled CLI from the CLI's GitHub release, and builds its images from them. CI publishes each
version from a release tag with npm provenance. The
[Release section of the tech stack](./tech-stack.md#release) gives the CI flow, and the
[releasing runbook](../../runbooks/releasing.md) gives the steps a maintainer takes.
[The overview](../overview.md#terms) defines the terms this doc uses, such as pepys.

A release is one merged release pull request. release-please tags every package at the new version
on the merge commit, and creates a GitHub release for each tag. Two workflows build and check the
packages:

- **The publish run.** After a maintainer merges the release pull request, the `main.yml` run of
  that push tags the release. Its `dispatch-publish` job then dispatches a second `main.yml` run at
  the tag. That second run is the publish run: its `publish` job publishes to npm, and its
  `cli-assets` job uploads the CLI release assets.
- **The rehearsal.** The `npm packages` workflow runs on every pull request that touches a package.
  It runs the same build and checks as the publish run, and publishes and uploads nothing.

The publish run starts at the tag because npm provenance records the run's own commit as the source,
and only a run at the tag has the tagged commit as its own.

When a publish run fails after the tags exist, such as during an npm outage, a maintainer dispatches
`main.yml` again at a tag of that release. This republish runs the `main.yml` that the tagged commit
holds, publishes each package the maintainer lists, and skips each version npm already holds. When
the list includes `apps/cli`, it also uploads the CLI release assets, under the rules in
[The CLI release assets](#the-cli-release-assets). The
[releasing runbook](../../runbooks/releasing.md#republish-a-release-that-failed-to-publish) gives
the steps.

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
copy of each. It lists its other `@pepys/*` peers as optional, because only its
[test helpers](#test-helpers-in-a-package) import them. Each `@pepys/*` peer range is a caret range
on the pepys minor version that boxxy builds against, so a deployment can take any patch release of
that minor version.

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

### Test helpers in a package

A package's `src/test-utils/` folder ships and is exported with the package, so the package's users
can call its test helpers in their own tests. When a helper imports a package that only those users
need, the package lists that import twice: as an optional peer dependency, so a user installs it
only to use the helper, and as a dev dependency, so the workspace has it for the package's own
tests. `@boxxy/pepys`, for example, lists the pepys test and ingest packages as optional peers, for
its helpers that start a pepys inside a test.

When the optional peer is another `@boxxy/*` package, its range in the repo is `workspace:*`. The
publish run packs each package with `bun pm pack`, which writes the release's exact version in place
of `workspace:*`.

## The CLI release assets

An agent image runs no package manager: its build downloads pinned files and checks their SHA-256.
So the publish run's `cli-assets` job attaches three files to the GitHub release of each
`@boxxy/cli@<version>` tag:

| Asset                      | What it holds                                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `boxxy-linux-x64`          | The CLI, compiled by Bun into one Linux binary                                                             |
| `boxxy-hook-plugin.tar.gz` | The [hook plug-in](../interfaces/cli-and-hooks.md#the-hook-plug-in), under one top folder, `hook-plugin/`. |
| `SHA256SUMS`               | One `sha256sum` line for each of the other two                                                             |

The binary carries its own Bun runtime, so the agent image needs no Bun. The deployment's image
build installs the binary as `boxxy` on the `PATH`, because the hooks call `boxxy`.

A deployment's maintainer checks the files of a version, `<version>`, like this:

```bash
gh release download '@boxxy/cli@<version>' --repo zgeoff/boxxy -p boxxy-linux-x64 -p boxxy-hook-plugin.tar.gz -p SHA256SUMS
sha256sum -c SHA256SUMS
```

The deployment's agent image Dockerfile then pins the checksum of each file from that `SHA256SUMS`.

The `cli-assets` job builds the files from the tagged commit, with the pinned Bun and the frozen
lockfile. Before the upload, it runs the binary to check that it starts, prints its version and
usage, and refuses a hook call with no server URL. Then it checks the files against `SHA256SUMS`.
`scripts/publish/release-cli-assets.ts` holds the steps and the expected output. The rehearsal runs
the same build and checks.

Once a GitHub release holds a complete set, the job never replaces it, because an image may already
pin its checksums. Bun does not promise the same bytes from two compiles of one commit, so a rebuilt
binary would break every pin. The job uploads `SHA256SUMS` last, so a `SHA256SUMS` that GitHub marks
as uploaded, with a size above zero, means the set is complete. From the state of `SHA256SUMS`, the
job takes one of two paths:

- When `SHA256SUMS` is complete, the job skips that GitHub release.
- In any other state, the job uploads all three files again, with `--clobber`. One such state is an
  upload that failed halfway: GitHub keeps an asset whose upload failed in the state `starter`.

The job also fails, and uploads nothing, in two cases:

- The tag `@boxxy/cli@<version>` has no GitHub release. release-please creates it when it tags, so
  the job creates none.
- The run's checkout is not the commit of that tag, such as a dispatch by hand at `main`. The job
  fails before the build. It reads the upload tag from the version in `package.json`, and a later
  commit can hold the same version, so without this check it would upload files built from other
  code under an existing tag.

## One version for every package

`release-please-config.json` puts every package in one `linked-versions` group, `boxxy`. When a
release holds a change to any package, release-please gives every package in the group the highest
version among them. It releases each package at that version, including a package with no change.
Each package still gets its own tag, `@boxxy/<folder>@<version>`, and every tag of one release sits
on the same merge commit.

The config's `plugins` list holds two plugins: `node-workspace` first, then `linked-versions`.
release-please needs this order to link versions in a workspace. By default each plugin merges the
packages' changes into the one release pull request. The `linked-versions` plugin has to do that
merge, because it needs every package at once to give them one version. So `node-workspace` runs
with `"merge": false`: it only updates the `@boxxy/*` dependency ranges.

To add a package to the group, add two lines to `release-please-config.json`: its entry under
`packages`, and its component name in the `linked-versions` plugin's `components`. A private package
needs both lines too. `release-please-config.test.ts` fails while any package folder has no entry or
its component is missing from `components`.

Before version 1.0, a breaking change raises the minor version and any other releasable change
raises the patch version (`bump-minor-pre-major`, `bump-patch-for-minor-pre-major`).

## The first publish of a new name

CI publishes through npm trusted publishing, with no npm token. A maintainer sets a trusted
publisher on each npm package: it lists the repo and the workflow allowed to publish that package.
npm accepts a trusted publisher only on a package that is already on the registry. So a maintainer
publishes each new name once by hand, as a placeholder, and CI publishes every real version.

npm also expires a trusted publisher that no publish uses soon after it is added, so the maintainer
adds it only when a release pull request that releases the package is ready to merge. The
[releasing runbook](../../runbooks/releasing.md#publish-a-new-package) gives the deadline and the
commands:

1. A maintainer with two-factor authentication on the `@boxxy` npm org publishes version `0.0.1` of
   the name from their own machine. The placeholder holds no code: only a `package.json` with the
   name, the license and the `repository` field, a README that marks it as a placeholder, and the
   license file. The maintainer builds it outside the repo's package folders, so it can reserve a
   name before the package's code is on `main`.
2. When the release pull request is ready to merge, the maintainer adds a trusted publisher to the
   name. The trusted publisher lists this repo and `main.yml`, and allows npm publish.
3. The release publishes the package's first real version from CI, with provenance. That version is
   above `0.0.1`, because `initial-version` is `0.1.0` and the group version is at least that.

## What a deployment pins

A deployment pins every `@boxxy/*` line of its `package.json` to one exact version, and its lockfile
to the same. Its agent image pins the CLI release assets of that version, each by its checksum.

To upgrade, the deployment's maintainer or its automation reads the `latest` version of
`@boxxy/server` on npm, and moves every `@boxxy/*` line to that version in one change. Because every
package shares the version, that one read is enough: no package of a release can sit at another
version.

The deployment also pins `@pepys/kit` to a version in the peer range of `@boxxy/pepys`. boxxy moves
to a new pepys minor version in one boxxy release, which moves these together: the `@pepys/*` lines
of the catalog, the peer ranges of `@boxxy/pepys`, and its generated glue code. `bun run glue` in
`packages/pepys` rewrites that glue from the plug-in, as
[facts and pepys](../interfaces/facts-and-pepys.md#the-boxxy_work-package) describes. The deployment
then moves its `@boxxy/*` and `@pepys/kit` pins together, to that release.
