# plan-ordering

The owner moves an item to the front of the queue with `boxxy expedite`, and holds an item back with
`boxxy defer` until `boxxy undefer`. The journey runs each of the three through `action plan-lever`.

The journey files two open items, "Sort the settings by use" and then "Sort the settings by name".
It expedites the second, defers the first, and runs one attempt. Then it undefers the first item and
runs one tick.

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

- `boxxy item` exits 0: the runner claimed "Sort the settings by name", and its triage attempt
  `succeeded` with the outcome `accepted`.
- The first `boxxy attempts` exits 0: while it is deferred, "Sort the settings by use" has no
  attempt.
- The last `boxxy attempts` exits 0: after the undefer and one tick, "Sort the settings by use" has
  one triage attempt.
- `plan-lever` exits 1 with `check-failed` when no open item has the title it names.
