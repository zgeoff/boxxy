# hold-recovery

The owner sends a held item back to a phase with `boxxy item retry --phase <phase>`. The retry lifts
the hold, and the next attempt works that phase. The journey runs `boxxy item retry` through
`action retry-item`.

The journey runs a triage attempt and a design attempt, then opens a pull request on the fake
GitHub. Its build attempt closes out `blocked` with that pull request linked, and boxxy holds the
item. Then the journey retries the item in review, and runs a review attempt that closes out
`passed`. A `passed` review needs the linked pull request. The hold comes from a `blocked` build,
because `boxxy item retry` refuses an item that waits on the owner.

## Journey

```bash
bun verify use --feature hold-recovery
bun verify action file-item --title "Pick the theme in the settings"
bun verify action run-session --close-out accepted --minutes 4
bun verify action run-session --close-out designed --minutes 10
bun verify action open-pull-request
bun verify action run-session --close-out blocked --minutes 12 --pull-request opened
bun verify boxxy hold --reason blocked --state held
bun verify action retry-item --phase review
bun verify action run-session --close-out passed --minutes 8
bun verify boxxy item --title "Pick the theme in the settings" --phase review --outcome passed
bun verify boxxy hold --reason blocked --state lifted
```

## End state

- The first `boxxy hold` exits 0: after the build attempt, the item is held with the reason
  `blocked`.
- `boxxy item` exits 0: the review attempt `succeeded` with the outcome `passed`.
- The last `boxxy hold` exits 0: the `blocked` hold is `lifted`.
