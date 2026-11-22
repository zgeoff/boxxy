---
name: project-ci-design
description:
  'The CI facts of the boxxy repo, and the ci-design rules it replaces. Load it beside ci-design
  before you change a workflow, a job, a check script or the BUN_CHECK_SCRIPTS list in boxxy.'
metadata:
  kind: rule-set
---

# boxxy CI design

## Facts

| Fact            | Where                                                                              |
| --------------- | ---------------------------------------------------------------------------------- |
| Test budget     | none                                                                               |
| Required checks | `gh api repos/zgeoff/boxxy/rules/branches/main`, the `required_status_checks` rule |

## Departures

None.

## The check list

- CI runs the root scripts that the `BUN_CHECK_SCRIPTS` repo variable lists, and `gh variable list`
  shows its value. To change the list, rewrite the sentence of
  [the tech stack](../../../docs/architecture/repo/tech-stack.md) that gives the value, and ask the
  owner, in your PR description, to set the variable to match.
- Leave `bench` out of the list. The claim benchmark misses its own latency target, so `rig bench`
  fails, as [dispatch](../../../docs/design/boxxy/dispatch.md#the-built-claim-measured) records. The
  test budget in Facts is a different limit, on the test suite's run time.
