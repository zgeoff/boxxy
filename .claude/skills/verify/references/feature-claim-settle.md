# claim-settle

boxxy claims a filed item for triage, a worker session binds and closes out, and the attempt settles
with that outcome. The session reads another item of its repo. The owner files an item and the
runner tick does the rest. A triage session runs `boxxy attempt list-items` and
`boxxy attempt show-item` to look for a duplicate.

## Journey

```bash
bun verify use --feature claim-settle
bun verify action file-closed-item --title "Read the theme from the desktop"
bun verify action file-item --title "Read the system theme"
bun verify action run-session --close-out accepted --minutes 4
bun verify boxxy session-item --text "theme from the desktop" --title "Read the theme from the desktop"
bun verify boxxy item --title "Read the system theme" --phase triage --outcome accepted
```

## End state

`boxxy session-item` exits 0: the session lists one item with the text, and shows its title.
`boxxy item` exits 0: the item's triage attempt is `succeeded` with the outcome `accepted`.
`run-session` fails with `check-failed` when no tick claims the item, the hook does not bind, the
close-out is refused, or two ticks do not settle the attempt.
