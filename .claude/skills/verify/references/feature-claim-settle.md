# claim-settle

The owner files an item, and boxxy works it on its runner ticks. A tick claims the item for triage,
and a worker session starts. The session's hook binds the session to the attempt, and the session
closes out. Two more ticks settle the attempt with the session's outcome. While it works, the triage
session looks for a duplicate with `boxxy attempt list-items` and `boxxy attempt show-item`.

The journey files a closed item for the triage session to find. Then it files the item under test
and runs one triage attempt of it.

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

- `boxxy session-item` exits 0: as the triage session, `list-items` finds one item whose text holds
  "theme from the desktop", and `show-item` gives its title.
- `boxxy item` exits 0: the triage attempt of "Read the system theme" `succeeded` with the outcome
  `accepted`.
- `action run-session` runs the ticks itself. It exits 1 with `check-failed` when one of its steps
  fails:
  - no tick claims the item;
  - the session's hook does not bind the session;
  - the server refuses the close-out;
  - two ticks leave the attempt unsettled.
