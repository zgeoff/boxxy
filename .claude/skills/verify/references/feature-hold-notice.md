# hold-notice

When boxxy puts an item on hold, it sends one notice to the session that the owner registered with
`boxxy notices register`. In the harness, a fake notifier takes the place of atc, the service that
delivers notices to sessions, and keeps each notice it gets.

The journey registers a session through `action register-notices`, files an item, and runs an
attempt that closes out `needs-owner`. Then it runs one more tick. Keep the session name
`workbench.3.owner-notes` as written, because the last read checks it.

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

- `boxxy hold` exits 0: the item is held with the reason `needs-owner`.
- `boxxy notices` exits 0: the fake notifier got one notice for the item, with the reason
  `needs-owner`, for `workbench.3.owner-notes`.
- When `boxxy notices` finds no notice, check the `register-notices` step first. The fake notifier
  refuses every notice while no session is registered.
