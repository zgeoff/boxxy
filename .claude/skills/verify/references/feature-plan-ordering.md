# plan-ordering

The owner moves an item to the front of its pool with `boxxy expedite`, and holds another back with
`boxxy defer` until `boxxy undefer`. The runner tick claims the expedited item, claims no deferred
item, and claims the undeferred item on its next tick.

## Journey

```bash
bun verify use --feature plan-ordering
bun verify action file-item --title "Sort the settings by use"
bun verify action file-item-beside --title "Sort the settings by name"
bun verify action plan-lever --lever expedite --title "Sort the settings by name"
bun verify action plan-lever --lever defer --title "Sort the settings by use"
bun verify action run-session --close-out accepted --minutes 4
bun verify boxxy item --title "Sort the settings by name" --phase triage --outcome accepted
bun verify boxxy attempts --title "Sort the settings by use" --count 0
bun verify action plan-lever --lever undefer --title "Sort the settings by use"
bun verify action tick
bun verify boxxy attempts --title "Sort the settings by use" --count 1 --phase triage
```

## End state

The expedited item has a triage attempt that `succeeded` with the outcome `accepted`, and the
deferred item has no attempt. After the undefer and one tick, the deferred item has one triage
attempt. `plan-lever` fails with `check-failed` when no open item has the title.
