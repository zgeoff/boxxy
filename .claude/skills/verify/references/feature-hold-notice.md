# hold-notice

Run this journey to check that boxxy sends one notice to the owner's registered session when it puts
an item on hold. The owner registers the session with `boxxy notices register`, and
`action register-notices` runs that command. In the harness, a fake notifier takes the place of atc,
the service that delivers notices, and keeps each notice it gets. `bun verify boxxy notices` reads
the fake notifier.

The fake notifier refuses every notice while no session is registered. When
`bun verify boxxy notices` finds no notice, check that `action register-notices` exited 0.

## Journey

```bash
bun verify use --feature hold-notice
bun verify action register-notices --session workbench.3.owner-notes
bun verify action file-item --title "Choose the theme source"
bun verify action run-session --close-out needs-owner --minutes 4
bun verify action tick
bun verify boxxy hold --reason needs-owner --state held
bun verify boxxy notices --count 1 --reason needs-owner --session workbench.3.owner-notes
```

## End state

- `bun verify boxxy hold` exits 0: the session closed out `needs-owner`, and boxxy holds the item
  with that reason.
- `bun verify boxxy notices` exits 0: after the last tick, the fake notifier holds one notice for
  the item, with the reason `needs-owner`, sent to `workbench.3.owner-notes`.
