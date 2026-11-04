# 0012: Link attempts to commits by trailer and to PRs by hook

Date: 2026-11-04

## Decision

boxxy links an attempt to its commits and PRs only from evidence. The
[close-out design](../design/boxxy/close-outs.md#linking-attempts-to-commits-and-prs) describes both
links. Both mechanisms are proposed.

- **Commits:** each commit carries a trailer with the attempt id.
- **PRs:** a PostToolUse hook that sees `gh pr create` records the PR against the attempt, from the
  command's own output.

## Rejected alternatives

| Option                                         | Why not                                                                     |
| ---------------------------------------------- | --------------------------------------------------------------------------- |
| match by time window and file overlap          | Entire's 15-minute file-overlap matching links the wrong session (research) |
| a PR named in the session's scope              | the scope check proves the PR exists, not that the session opened it        |
| a link assumed from the item's branch or title | nothing proves the attempt made the change                                  |

## Why

Every outcome query, such as cost to land, survival, reverts and findings per recipe, depends on
this link. Entire's commit trailer keeps its link through rebase, cherry-pick and squash (research),
so a trailer survives the merge train's rebases (see [0011](./0011-merge-train-rules.md)). The
hook reads the PR number from the command that created it, so the link points to the attempt that
opened the PR.
