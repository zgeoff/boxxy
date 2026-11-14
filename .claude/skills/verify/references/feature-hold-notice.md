# hold-notice

An item that the rules hold sends one notice to the session that the owner registered with
`boxxy notices register`. The harness's notifier stands in for atc and keeps each notice it takes.

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

Each read exits 0: the item holds with the reason `needs-owner`, and the notifier sent exactly one
notice for it, with that reason, to the registered session. The notifier refuses a notice while no
session is registered, so `boxxy notices` fails with `check-failed` when the registration did not
reach the server.
