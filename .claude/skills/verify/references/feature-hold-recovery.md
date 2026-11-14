# hold-recovery

This journey proves that the owner's retry lifts a hold, and that the next attempt works the phase
the owner chose. The owner runs `boxxy item retry <item> --phase <phase>`, and
`action retry-item --phase` runs it on the current item.

`boxxy item retry` refuses an item in the `held` state, the state a `needs-owner` close-out leaves.
So the journey holds the item with a `blocked` build, and a retry can lift that hold. A `passed`
review needs a linked pull request, so the journey opens one with `action open-pull-request` before
the build. `--pull-request opened` on the build's `action run-session` links that pull request.

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

- The first `bun verify boxxy hold` exits 0: the triage, design and build attempts ran in that
  order, and the build closed out `blocked`, so boxxy holds the item with the reason `blocked`.
- `bun verify boxxy item` exits 0: after the retry, the review attempt `succeeded` with the outcome
  `passed`.
- The last `bun verify boxxy hold` exits 0: the `blocked` hold is `lifted`.
