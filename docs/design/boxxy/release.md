# How boxxy ships

boxxy ships as `@boxxy/*` packages on npm, and every package carries the same version. A deployment in another repo never builds from this repo: it installs the packages from npm at one version, takes the compiled CLI from the CLI's GitHub release, and builds its images from them. CI publishes each version from a release tag with npm provenance. The [Release section of the tech stack](./tech-stack.md#release) gives the CI flow, and the [releasing runbook](../../runbooks/releasing.md) gives the steps a maintainer takes.

## The packages

Every package folder under `apps/`, `modules/`, `adapters/`, `libs/` and `packages/` publishes as `@boxxy/<folder>`, unless its `package.json` sets `"private": true`. Each public package ships its TypeScript source, its declarations in `dist/`, its README and the license, with `publishConfig.access` set to `public`.

A deployment installs these:

| What it builds | Packages it installs |
| --- | --- |
| the server image | `@boxxy/server`, and each `@boxxy/*` package the server depends on |
| the pepys deployment | `@boxxy/pepys`, the plug-in, and `@boxxy/model` |
| the agent image | no package: the files that the [CLI's GitHub release](#the-cli-release-assets) carries |

`@boxxy/pepys` lists `@pepys/kit` and `zod` as peer dependencies, so the plug-in uses the deployment's own copy of each. Every `@pepys/*` peer range of `@boxxy/pepys` has one floor, `^0.3.1`, so a deployment can take any `0.3.x` release from `0.3.1` on, and a boxxy release moves the floor when it moves to a new pepys version. Inside this repo, the root catalog pins every `@pepys/*` package that boxxy installs to one exact npm version, and the dev dependencies of `@boxxy/pepys` take them from the catalog.

A package never names an export that its tarball lacks, and never ships source that imports a name its install does not bring. The publish packs each package, reads the tarball's file list, and refuses the run before `npm publish` when an `exports` target has no packed file, or a packed `src` file imports a bare name that is in no `dependencies`, `peerDependencies` or `optionalDependencies` field. `bun` and the `node:` and `bun:` modules count as listed. The CI rehearsal makes both checks on every package.

A `src/test-utils/` folder ships and is exported with its package. A helper there may import a package that only a user of the helper needs. The package lists it as an optional peer dependency and keeps the dev dependency for the workspace: `@boxxy/pepys` lists `@pepys/testing`, `@pepys/ingest`, `@pepys/api`, the GitHub and telemetry plug-ins and `@orpc/client` for its two test deployments `@boxxy/forge-github` and `@boxxy/store-sqlite` list `@boxxy/dispatch`, `@boxxy/worker-atc` lists `@modelcontextprotocol/server` for its atc stand-in, `@boxxy/dispatch` lists `@boxxy/rules`, and `@boxxy/closeout` lists `@faker-js/faker`. A `workspace:*` peer packs as the release's exact version.

## The CLI release assets

An agent image runs no package manager: its build downloads pinned files and checks their SHA-256. So each release of `@boxxy/cli` attaches three files to its GitHub release, `@boxxy/cli@<version>`:

| Asset | What it holds |
| --- | --- |
| `boxxy-linux-x64` | The CLI compiled with `bun build --compile --target=bun-linux-x64` from `apps/cli/src/main.ts`. It needs no Bun on the image. The image installs it as `boxxy` on the `PATH`, because the hooks run `boxxy`. |
| `boxxy-hook-plugin.tar.gz` | The [hook plug-in](./v1-cli.md#the-hook-plug-in), under one top folder, `hook-plugin/`. |
| `SHA256SUMS` | One `sha256sum` line for each of the other two. |

A consumer checks the files of a version, `<version>`, like this:

```bash
gh release download '@boxxy/cli@<version>' --repo zgeoff/boxxy -p boxxy-linux-x64 -p boxxy-hook-plugin.tar.gz -p SHA256SUMS
sha256sum -c SHA256SUMS
```

A Dockerfile pins the checksum of each file from that release's `SHA256SUMS`.

The publish run builds the files from the tagged commit, after `bun install --frozen-lockfile` with the pinned Bun, in the `cli-assets` job of `main.yml`. Before the upload, the job runs the binary: `--version` prints the package version, `--help` prints the usage line, and `hook session-start` with no `BOXXY_URL` exits 2 with `error: BOXXY_URL is not set`. Then `sha256sum -c` checks the checksum file. `scripts/publish/release-cli-assets.ts` holds the steps. The `npm packages` workflow runs the same build and checks on every pull request that touches a package, with no upload.

Bun does not promise the same bytes from two compiles of one commit: the name of the output file alone changes them. The archive gives the same bytes on each run, because tar fixes the order, the times, the owner and the modes. So the job never replaces a set that an image may already pin:

- It uploads `SHA256SUMS` last. A release that holds a finished, non-empty `SHA256SUMS` holds the whole set, and the job skips it.
- A release with no finished `SHA256SUMS`, such as after an upload that failed halfway, gets all three files again, with `--clobber`. GitHub keeps an asset whose upload failed in the state `starter`.
- When the tag `@boxxy/cli@<version>` has no GitHub release, the job fails and creates none.
- When the run's checkout is not the commit of that tag, such as a dispatch by hand at `main`, the job fails before the build. The upload tag comes from the version in `package.json`, and a later commit can hold the same version.

A republish runs the workflow of the tag it starts at. So a republish at a tag from before the `cli-assets` job attaches no assets.

## One version for every package

`release-please-config.json` puts every package in one `linked-versions` group, `boxxy`. When a release holds a change to any package, release-please gives every package in the group the highest version among them, and releases each package at that version, a package with no change included. Each release still gets its own tag, `@boxxy/<folder>@<version>`, and every tag of one release sits on the same merge commit.

The `node-workspace` plugin comes first, with `"merge": false`. release-please needs that order when it links versions in a workspace: the workspace plugin then updates the `@boxxy/*` dependency ranges and leaves the merge of the release pull request to the group.

A new package joins the group with two lines in `release-please-config.json`: its entry under `packages`, and its component name in the group's `components`. `release-please-config.test.ts` fails while a package folder has no entry or its component is missing from the group.

Before version 1.0, a breaking change raises the minor version and any other releasable change raises the patch version (`bump-minor-pre-major`, `bump-patch-for-minor-pre-major`).

## The first publish of a new name

npm adds a trusted publisher only to a package that is already on the registry. So each new name goes out once by hand, as a placeholder, and CI publishes every real version:

1. A maintainer with two-factor authentication on the `@boxxy` npm org publishes version `0.0.1` of the name from their own machine. The placeholder holds no code: only a `package.json` with the name, the license and the `repository` field, a README that says it is a placeholder, and the license file. It is built outside the repo's package folders, so it can reserve a name before the package's code is on `main`.
2. The maintainer adds a trusted publisher for the name that names this repo and `main.yml`, with npm publish allowed.
3. The next release publishes the package's first real version from CI, with provenance. That version is above `0.0.1`, because `initial-version` is `0.1.0` and the group version is at least that.

The [releasing runbook](../../runbooks/releasing.md#publish-a-new-package) gives the commands. A trusted publisher that no publish uses within 2 days expires, so step 2 waits until a release pull request is ready to merge.

## What a deployment pins

A deployment pins every `@boxxy/*` line of its `package.json` to one exact version, and its lockfile to the same. Its agent image pins the CLI release assets of that version, each by its checksum. Its release check reads the version that npm holds for `@boxxy/server`, and moves every `@boxxy/*` line to that version in one change. Because every package shares the version, that one read is enough: no package of a release can sit at another version.

The deployment also pins `@pepys/kit` to a version in the peer range of `@boxxy/pepys`. When pepys publishes a new minor kit version, boxxy moves the `@pepys/*` lines of the root catalog to that version, regenerates the glue, sets the peer range to match, and releases; the deployment then moves both pins together.
