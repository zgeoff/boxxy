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

- Change the CI script list in the `BUN_CHECK_SCRIPTS` repo variable, which `gh variable list`
  shows, and in the sentence of [the tech stack](../../../docs/design/boxxy/tech-stack.md) that
  gives its value. Ask the owner to set the variable.
- Leave `bench` out of the list. The claim benchmark fails its budget, as
  [dispatch](../../../docs/design/boxxy/dispatch.md#the-built-claim-measured) records.
