# Releasing

Use this runbook to set up releases once, to publish a package that is new to npm, to merge a
release pull request, and to recover a release that failed. CI does the rest of a release.

CI releases every `@boxxy/*` package to npm at one shared version, as
[How boxxy ships](../design/boxxy/release.md) describes:

1. A commit lands on `main` that release-please counts as releasable, such as a `feat` or a `fix`.
   The release job in `.github/workflows/main.yml` runs release-please, which opens one release pull
   request. That pull request sets every package to the same new version, and adds a changelog entry
   for each package.
2. A maintainer merges the release pull request. The release job never merges it.
3. The merge starts a run of the `Main` workflow, `main.yml`, which creates a tag for each released
   package, `@boxxy/<folder>@<version>`. Every tag of one release sits on the same merge commit. The
   run then starts a second `Main` run at one of those tags.
4. The second run publishes each released package from the tag, with npm provenance, once its checks
   pass.

`<folder>` is the package's folder name, such as `model`. `<path>` is the folder's path from the
repo root, such as `libs/model`.

## One-time setup

npm sets up trusted publishing only for a package that exists on the registry. So publish each
package by hand first, then turn CI releases on.

**CAUTION:** Finish every step below within 2 days of step 1, when you add the first trusted
publisher. npm expires a trusted publisher that no publish uses in its first 2 days.

1. Do [Publish a new package](#publish-a-new-package) for every package, with each package's trusted
   publisher. Expect each package's npm access page to list a trusted publisher.
2. Take the client ID and the private key of the release GitHub App, which the release jobs of the
   other zgeoff repos use. GitHub runs CI on a pull request that this App opens, and on none that
   the default workflow token opens. Set the client ID as the `RELEASE_APP_ID` repo variable, and
   the private key as the `RELEASE_APP_PRIVATE_KEY` secret. Expect
   `gh variable list --repo zgeoff/boxxy` to list `RELEASE_APP_ID`.
3. In the repo's Settings, open Actions, then General, and check "Allow GitHub Actions to create and
   approve pull requests". Expect the box to stay checked after you save.
4. Turn the release job on:

   ```bash
   gh variable set RELEASE_ENABLED --repo zgeoff/boxxy --body true
   ```

   Expect `gh variable list --repo zgeoff/boxxy` to show `RELEASE_ENABLED` with the value `true`.

5. Merge a `feat` or `fix` commit to `main`. Expect the release job to open a release pull request
   that sets every package to one version, `<version>`.
6. Merge that pull request, as [Merge a release pull request](#merge-a-release-pull-request)
   describes. Expect `npm view @boxxy/<folder>@<version> version` to print `<version>` for each
   package, which CI published through each trusted publisher.

## Publish a new package

A new name goes out once from a maintainer's machine as a placeholder, version `0.0.1`, with no
code. CI publishes every real version, starting with the next release.
[How boxxy ships](../design/boxxy/release.md#the-first-publish-of-a-new-name) says why. The
`npm-first-publish` script of the
[npm-publish skill](https://github.com/zgeoff/skills/tree/main/skills/npm-publish) does the checks
and the publish.

1. Add the package to `release-please-config.json`: an entry under `packages`, at its `<path>`, with
   `@boxxy/<folder>` as its `component` and `0.1.0` as its `initial-version`, and `@boxxy/<folder>`
   in the `components` of the `linked-versions` group. Expect
   `bun test release-please-config.test.ts` to pass.
2. Make a placeholder folder outside the repo's package folders, such as
   `/tmp/boxxy-placeholders/<folder>`. Give it a `package.json` with the name `@boxxy/<folder>`, the
   version `0.0.1`, the license `MIT`, the `repository` field of the package's real `package.json`,
   and `"publishConfig": { "access": "public" }`. Add a `README.md` that says the version is a
   placeholder, and a copy of `LICENSE`.
3. From the repo root, run the check:

   ```bash
   npm-first-publish check <placeholder folder>... main.yml
   ```

   Expect `npm accepts the dry run` for each placeholder, then `plan saved`.

4. In your own terminal, run the publish. npm asks you to log in and approve with two-factor
   authentication:

   ```bash
   npm-first-publish
   ```

   Expect `published @boxxy/<folder>@0.0.1` for each placeholder.

5. **CAUTION:** Do this step only when a release pull request that releases the package is ready to
   merge. npm expires a trusted publisher that no publish uses in its first 2 days.

   Add the trusted publisher of each new package:

   ```bash
   npm-first-publish trust <path>... main.yml
   ```

   Expect `trusted publishing on` for each package.

6. Merge the release pull request. Expect `npm view @boxxy/<folder>@<version> version` to print the
   release's `<version>`.

## Merge a release pull request

1. Find the open pull request from the `release-please--branches--main` branch. Expect it to bump
   the version and update the changelog of each package it releases. When the bump changes the
   lockfile or the formatting, the release job adds a commit that fixes them.
2. Wait for the pull request's checks to pass. Expect `gh pr checks <pr number> --repo zgeoff/boxxy`
   to show each check as `pass`.
3. Merge the pull request. Expect a new `Main` run whose release job creates a tag for each released
   package. Expect its `Dispatch the release publish` job to start a second `Main` run at one of the
   tags.
4. Watch the second run:

   ```bash
   gh run watch --repo zgeoff/boxxy
   ```

   Expect its publish step to end with an `npm publish` for each released package. Expect its
   `Attach the CLI release assets` job to print `uploaded the CLI assets to @boxxy/cli@<version>`.

5. Check the registry:

   ```bash
   npm view @boxxy/<folder>@<version> version
   ```

   Expect the version you released. Right after a publish, `npm view` can print nothing, or answer
   `E404` for a package that npm never held. Run the command again until it prints the version.

6. Check the CLI's release assets in an empty folder:

   ```bash
   gh release download '@boxxy/cli@<version>' --repo zgeoff/boxxy -p boxxy-linux-x64 -p boxxy-hook-plugin.tar.gz -p SHA256SUMS && sha256sum -c SHA256SUMS
   ```

   Expect `OK` for `boxxy-linux-x64` and `boxxy-hook-plugin.tar.gz`.

## Recover a release blocked by a workflow change

The release App's token has no permission to change workflows. When a commit after the release merge
commit on `main` changes a file in `.github/workflows/`, GitHub refuses to let that token create a
tag on the merge commit. The release job then fails before release-please runs. Every later release
run fails the same way until you create the tags with your own token, which needs the `workflow`
scope.

1. Read the merge commit of the release pull request:

   ```bash
   gh pr view <pr number> --repo zgeoff/boxxy --json mergeCommit --jq .mergeCommit.oid
   ```

   Expect a 40-character commit ID, `<merge commit>`.

2. Do steps 3 and 4 for each package that the pull request released.
3. Print the package's changelog at the merge commit, with
   `git show <merge commit>:<path>/CHANGELOG.md`. Save the section for the released version to a
   file, `<notes file>`. Expect the file to start with the version's heading.
4. Create the package's release and tag at the merge commit:

   ```bash
   gh release create '@boxxy/<folder>@<version>' --repo zgeoff/boxxy --target <merge commit> --title '@boxxy/<folder>@<version>' --notes-file <notes file>
   ```

   Expect `gh release view '@boxxy/<folder>@<version>' --repo zgeoff/boxxy` to show the release.

5. Mark the pull request as tagged, so release-please stops retrying it:

   ```bash
   gh pr edit <pr number> --repo zgeoff/boxxy --remove-label 'autorelease: pending' --add-label 'autorelease: tagged'
   ```

   Expect the pull request to carry the `autorelease: tagged` label.

6. Publish the released packages, as
   [Republish a release that failed to publish](#republish-a-release-that-failed-to-publish)
   describes. Expect the release job to pass on the next push to `main`.

## Republish a release that failed to publish

A release can create its tags and then fail to publish, such as during an npm outage. A republish
skips each version that npm already holds. It publishes a version below the package's `latest`
dist-tag under the `backport` dist-tag, so `latest` stays on the newer version.

Every package of one release pull request has its tag on the same merge commit. Dispatch one run at
any of those tags, and list the `<path>` of each package to publish:

1. Dispatch the run:

   ```bash
   gh workflow run main.yml --repo zgeoff/boxxy --ref '@boxxy/<folder>@<version>' -f republish_paths='["<path>"]'
   ```

   Expect a new `Main` run. It skips the release job, and once its checks pass, it publishes each
   listed package from the tag.

2. Watch the run:

   ```bash
   gh run watch --repo zgeoff/boxxy
   ```

   Expect the publish step to publish each package, or to print
   `skipping @boxxy/<folder>@<version>: already published` for a version npm holds.

When `apps/cli` is among the listed paths, the run also attaches the CLI's assets. Expect
`skipping the CLI assets: @boxxy/cli@<version> already holds SHA256SUMS` for a release that holds
the whole set. The run uploads all three files again only when `SHA256SUMS` is missing.
[The CLI release assets](../design/boxxy/release.md#the-cli-release-assets) gives the reason.

**CAUTION:** A new compile can give a binary with a new checksum, which breaks each image that pins
the old one. Delete `SHA256SUMS` from a release only to replace a set that no image pins yet.

To replace the whole set, delete the checksum file, then dispatch the run with `["apps/cli"]`:

```bash
gh release delete-asset '@boxxy/cli@<version>' SHA256SUMS --repo zgeoff/boxxy --yes
```

Expect the next run to print `uploaded the CLI assets to @boxxy/cli@<version>`.
