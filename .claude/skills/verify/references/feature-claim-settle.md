# claim-settle

Run this journey to check that boxxy claims a filed item, starts a worker session for its triage,
and settles the attempt with the outcome that the session closes out with. It also proves that the
session can read another item of its repo. A triage session reads other items to look for a
duplicate, with `boxxy attempt list-items` and `boxxy attempt show-item`.

The owner reaches the feature with `boxxy item file` alone: boxxy does the rest on its runner ticks.
`action file-closed-item` files a closed item, which exists only for the session to find. The
`accepted` close-out fixes the outcome, whatever the session finds.

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

- `bun verify action run-session` exits 0: a tick claimed the item, the session's start hook bound
  the session to the attempt, the server took the close-out, and two ticks settled the attempt. When
  one of these fails, it exits 1 with `check-failed`. Read the evidence to find the step.
- `bun verify boxxy session-item` exits 0: as the session, `boxxy attempt list-items` found the
  closed item by its text, and `boxxy attempt show-item` showed its title.
- `bun verify boxxy item` exits 0: the triage attempt of "Read the system theme" `succeeded` with
  the outcome `accepted`.
