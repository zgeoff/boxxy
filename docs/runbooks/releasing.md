# Releasing

Use this runbook to set up releases once, to publish a package that is new to npm, to merge a
release pull request, and to recover a release that failed. CI does the rest of a release.

CI releases each `@boxxy/*` package to npm on its own version:

1. A commit lands on `main` that release-please counts as releasable, such as a `feat` or a `fix`.
   The release job in `.github/workflows/main.yml` runs release-please, which opens one release pull
   request. That pull request bumps the version and adds a changelog entry for each package the
   commit changed.
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

1. For each package, do steps 2 to 5 of [Publish a new package](#publish-a-new-package). Skip its
   step 1: `release-please-config.json` lists every package already. Expect each package's npm
   access page to list a trusted publisher.
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

5. Merge a releasable commit to `main`. Expect the release job to open a release pull request that
   sets each package to `0.1.0`.
6. Merge that pull request, as [Merge a release pull request](#merge-a-release-pull-request)
   describes. Expect npm to hold `0.1.0` of each package, which CI published through each trusted
   publisher.

## Publish a new package

A package's first version goes out from a maintainer's machine, and CI publishes every later one.
The hand publish puts version `0.0.0`, the version in a new package's `package.json`, on npm. CI's
first release of the package is `0.1.0`.

1. Add the package to `release-please-config.json`, under its `<path>`, with `@boxxy/<folder>` as
   its `component` and `0.1.0` as its `initial-version`. Merge that change to `main`. Expect
   `bun test release-please-config.test.ts` to pass; it fails while a package folder has no entry.
2. Sign in to npm as an account that can publish under the `@boxxy` scope:

   ```bash
   npm login
   npm whoami
   ```

   Expect `npm whoami` to print your npm username.

3. From the repo root, on an up-to-date `main`, run the first publish:

   ```bash
   bash scripts/first-publish.sh <path>
   ```

   Expect `published @boxxy/<folder>@0.0.0`, followed by the trusted publisher settings. When npm
   already holds the package, the script stops with `already exists on npm`.

4. Open `https://www.npmjs.com/package/@boxxy/<folder>/access`, and add a trusted publisher for
   GitHub Actions with the settings the script printed. Expect the access page to list the
   publisher.
5. Turn on "Allow npm publish" for the publisher. While it is off, the publisher allows only
   `npm stage publish`, and the publish in `main.yml` fails with `ENEEDAUTH`. Expect the access page
   to show npm publish allowed.
6. Within 2 days of step 4, merge a releasable commit that changes the package. Expect a release
   pull request that sets the package to `0.1.0`.
7. Merge the release pull request. Expect npm to hold `0.1.0` of the package.

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

   Expect its publish step to end with an `npm publish` for each released package.

5. Check the registry:

   ```bash
   npm view @boxxy/<folder> version
   ```

   Expect the version you released. Right after the first publish of a package that npm never held,
   `npm view` can answer `E404`; run the command again until it prints the version.

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
skips each version that npm already holds.

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
