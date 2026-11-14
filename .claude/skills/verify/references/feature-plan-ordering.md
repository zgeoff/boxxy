# plan-ordering

This journey proves that a deferred item gets no attempt, and gets one after the owner undefers it.
It runs the expedite too. While one item is deferred, the runner can claim only the other, so the
journey never proves that an expedite moves an item ahead of an older one.

The owner moves an item to the front with `boxxy expedite`, and holds an item back with
`boxxy defer` until `boxxy undefer`. `action plan-lever` runs the command that `--lever` names, on
the open item with `--title`. `action file-item-beside` files the second item and keeps the first
open beside it.

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

- `bun verify boxxy item` exits 0: the tick in `action run-session` claimed "Sort the settings by
  name", and its triage attempt `succeeded` with the outcome `accepted`.
- The first `bun verify boxxy attempts` exits 0: the deferred "Sort the settings by use" has no
  attempt.
- The last `bun verify boxxy attempts` exits 0: after the undefer, one tick gave "Sort the settings
  by use" one triage attempt.
