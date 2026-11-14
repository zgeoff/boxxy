# hold-recovery

The owner sends a held item to a phase with `boxxy item retry --phase`. The retry lifts the hold,
and the next attempt runs in that phase.

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

Each read exits 0: the build session closed out `blocked` and the item held with the reason
`blocked`. After the retry, the review attempt `succeeded` with the outcome `passed`, and the item
holds nothing.
