# The ship watch and the shipped wait

A step can wait until an item's merged code ships, and a server pass called the ship watch reads
GitHub to find out when. You set how each repo ships in the rules file, the watch records each ship
as a row and a fact, and the `shipped` wait reads those rows. Read this doc before you change a
`repos` entry, the `shipped` wait or the watch.

[The pipeline](./pipeline.md#step-gates-and-skips) covers the gates a wait slots into, and
[attempts](./attempts.md#skipped-attempts) the skipped attempt a wait skip writes.
[GitHub](../interfaces/github.md#the-ship-reads-of-the-adapter) covers the forge reads the watch
makes.

## How a repo ships

Give each repo one ship rule in the `repos` section of the rules file. A repo with no entry ships
`none`.

| `ships`                                             | The item has shipped when                                                                |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `none`                                              | never: the repo has nothing to wait for                                                  |
| `{ deploy-tag: { tag } }`                           | the commit `tag` points to contains the item's merge commit                              |
| `{ release: { prerelease? } }`                      | a published release contains the merge commit                                            |
| `{ release: { prerelease? }, then: { repo, tag } }` | a release contains it, and `then.tag` in the deploy repo contains a bump of that release |

The item's merge commit belongs to the pull request merged last among those linked to the item's
succeeded builds. An item with no merged pull request has none.

## The shipped wait

To make a step wait, list `waits: [shipped]` on it. The server registers the wait kind. It comes
after the `merged` outcome, so the loader refuses a `shipped` wait unless an earlier step's phase
kind has that outcome. The wait reads one item and its repo's ship rule, and returns:

- `holds` when a shipped row has the item's merge commit, whatever the repo's rule is now;
- `skip` when the repo ships `none`;
- `waiting` otherwise.

When an item waits longer than the step's `waitNoticeHours`, or the dispatch module's
`waitNoticeHours` timeout when the step sets none, the owner gets one notice and the item keeps
waiting ([the overdue wait](./notices.md#the-notify-notice)). The wait never holds or skips an item
because it waited long.

A shipped row satisfies the wait only for the commit it holds. After
`boxxy item retry <item> --phase build` and a second merge, the watch reads the new commit. A rules
change never removes or rewrites a shipped row.

When the wait skips an item that has a line with the step's `criteria.tagged` tag, the claim writes
a `notify` notice with the skipped attempt, because no later check will prove that line.
[Notices](./notices.md#the-notify-notice) covers it.

The loader refuses a `shipped` wait on a server with no `github` section. When any step waits on
`shipped`, it also warns about each repo in `spawn.repos` with no `repos` entry, because that repo's
items skip the step. The server logs each warning on load and on each rules reload.

## The watch

When the server config has a `github` section, the server runs a pass on a fixed interval, whether
or not the runner is paused. A pass reads each item that is not held or closed, whose repo is in
`spawn.repos`, whose position is a step that waits on `shipped`, whose repo ships something, and
that has no shipped row for its merge commit. It reads at most 50 such items, least recently read
first, so no item waits behind items that never ship. The rest wait for the next pass.

The pass calls `readRepo` on each repo before any other call there. When the answer is `not-found`,
it logs that the App cannot read the repo, and that repo's items wait. The pass reads each forge
answer once, however many items share it. Then it applies the item's own repo's rule:

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

When a forge call throws, the pass writes nothing for the items that needed it and logs a warning,
and the next pass reads again.

When an item ships, the pass writes one `item_shipped` row, keyed by item and commit, and the
`boxxy.item.shipped` fact in one store change. The row holds:

- the rule, stored as `release-then-deploy` for `release` with `then`;
- the ref: the deploy tag, or the release tag for `release`;
- for `release` with `then`, the release tag the bump named;
- when the watch saw the ship, which is not when it happened.

The pass never writes a second row for the same item and commit. A webhook never changes boxxy
state: only the watch writes `item_shipped`.

The watch reads GitHub through the forge adapter, never pepys. boxxy reads pepys only for reports,
through a reader that never retries. pepys also records no deploy for a repo that deploys its own
code with no bump pull request. pepys's stage times read GitHub's own release and deploy times,
never the shipped fact. [Facts and pepys](../interfaces/facts-and-pepys.md#what-every-fact-carries)
covers the fact.
