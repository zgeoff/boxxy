# The ship watch and the shipped wait

A step can wait until an item's merged code ships, and a server pass called the ship watch reads
GitHub to find out when. The rules file says how each repo ships, the watch records each ship as a
row and a fact, and the `shipped` wait reads those rows. Read this doc before you change a `repos`
entry, the `shipped` wait or the watch.

[The pipeline](./pipeline.md#step-gates-and-skips) covers the gates a wait slots into, and
[attempts](./attempts.md#skipped-attempts) the skipped attempt a wait skip writes.
[GitHub](../interfaces/github.md#the-ship-reads-of-the-adapter) covers the forge reads the watch
makes.

## How a repo ships

The rules file's `repos` section gives each repo one ship rule. A repo with no entry ships `none`.

| `ships`                                             | The item has shipped when                                                                |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `none`                                              | never: the repo has nothing to wait for                                                  |
| `{ deploy-tag: { tag } }`                           | the commit that `tag` names contains the item's merge commit                             |
| `{ release: { prerelease? } }`                      | a published release contains the merge commit                                            |
| `{ release: { prerelease? }, then: { repo, tag } }` | a release contains it, and `then.tag` in the deploy repo contains a bump of that release |

The merge commit is the one of the latest merged pull request, by merge time, among the pull
requests linked to the item's succeeded builds. An item with no merged pull request has none.

## The shipped wait

A step lists `waits: [shipped]`. The server registers the wait kind, and it comes after the `merged`
outcome, so the loader refuses it unless an earlier step's phase kind has that outcome. The wait
reads one item and its repo's ship rule, and answers:

- `holds` when a shipped row names the item's merge commit, whatever the repo's rule says now;
- `skip` when the repo ships `none`;
- `waiting` otherwise.

An item waits for its ship with no time limit.

A shipped row satisfies the wait only for the commit it names. After
`boxxy item retry <item> --phase build` and a second merge, the watch reads the new commit. A rules
change never removes or rewrites a shipped row.

When the wait skips an item that has a line with the step's `criteria.tagged` tag, the claim writes
a notice of the `notify` kind with the skipped attempt, because no later check will prove that line.
[Notices](./notices.md#the-notify-notice) covers it.

The loader refuses a `shipped` wait on a server with no `github` section, and warns about each repo
in `spawn.repos` that has no `repos` entry when any step waits on `shipped`, because those items
skip the step. The server logs each warning on load and on each rules reload.

## The watch

When the server config has a `github` section, the server runs a pass on a fixed interval, whether
or not the runner is paused. A pass reads each item that is not held or closed, whose repo is in
`spawn.repos`, whose position is a step that waits on `shipped`, whose repo ships something, and
that has no shipped row for its merge commit. It reads at most 50 such items, the ones it read least
recently first, so no item waits behind items that never ship, and the rest wait for the next pass.

The pass calls `readRepo` on each repo before any other call there. When the answer is `not-found`,
it logs that the App cannot read the repo and the item waits. Each forge answer is read once per
pass, however many items share it. Then it applies the item's own repo's rule:

- **`deploy-tag`:** the item ships when the tag's commit contains the merge commit.
- **`release`:** the pass reads the published releases newest first, skips drafts and, unless
  `prerelease: true`, prereleases, and stops at the first release that does not contain the merge
  commit. The oldest release it read that contains the commit is the item's release. With none, the
  item waits.
- **`release` with `then`:** once the item has a release, the pass lists the bot-authored pull
  requests of the deploy repo merged at or after that release was published. A bump counts when its
  body holds, as a whole URL, the release's URL or the URL of any release published after it, a
  prerelease included. The item ships when `then.tag`'s commit contains a counted bump's merge
  commit.

A forge call that throws writes nothing for the items that needed it, logs a warning, and the next
pass reads again.

When an item ships, the pass writes one `item_shipped` row, keyed by item and commit, and the
`boxxy.item.shipped` fact in one store change. The row holds the rule, the ref (the deploy tag, or
the release tag for `release`), the release tag a bump named for `release-then-deploy`, and when the
watch saw the ship, which is not when it happened. A row that exists already for the item and commit
is never written twice. A webhook never changes boxxy state: only the watch writes `item_shipped`.

The watch reads GitHub through the forge adapter, never pepys. boxxy reads pepys only for reports,
through a reader that never retries, and pepys records no deploy for a repo that deploys its own
code with no bump pull request. pepys's stage times keep reading GitHub's own release and deploy
times, and never the shipped fact.
[Facts and pepys](../interfaces/facts-and-pepys.md#what-every-fact-carries) covers the fact.
