# claim-settle

Run this journey to check that boxxy claims a filed item, starts a worker session for its triage,
and settles the attempt with the outcome that the session closes out with. It also proves that the
session can read another item of its repo. A triage session reads other items to look for a
duplicate, with `boxxy attempt list-items` and `boxxy attempt show-item`.

The journey then takes the item to a build that records evidence the server reads from GitHub. The
build asks for a check that has no run and gets a refusal, then records the check `pr / checks` and
the verdict `file-item`, and closes out `built` citing both, which `--close-out built-checked` asks
for. `action open-pull-request` opens the pull request, `action seed-checks` gives its head a passed
check and a passed verify gate with a report that lists `file-item`, and `--pull-request opened` on
the build's `action run-session` links it.

The owner reaches the feature with `boxxy item file` alone: boxxy does the rest on its runner ticks.
`action file-closed-item` files a closed item, which exists only for the session to find. The
`accepted` close-out sets the outcome, whatever the session finds.

## Journey

```bash
bun verify use --feature claim-settle
bun verify action file-closed-item --title "Read the theme from the desktop"
bun verify action file-item --title "Read the system theme"
bun verify action run-session --close-out accepted --minutes 4
bun verify boxxy session-item --text "theme from the desktop" --title "Read the theme from the desktop"
bun verify boxxy item --title "Read the system theme" --phase triage --outcome accepted
bun verify action run-session --close-out designed --minutes 10
bun verify action open-pull-request
bun verify action seed-checks
bun verify action run-session --close-out built-checked --minutes 12 --pull-request opened
bun verify boxxy item --title "Read the system theme" --phase build --outcome built
bun verify boxxy evidence --kind check --ref "pr / checks" --head 5e0f1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b
bun verify boxxy evidence --kind verdict --ref file-item --head 5e0f1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b
```

## End state

- The triage attempt of "Read the system theme" `succeeded` with the outcome `accepted`.
  `bun verify boxxy item` checks it.
- As the session, `boxxy attempt list-items` finds the closed item "Read the theme from the desktop"
  by its text, and `boxxy attempt show-item` shows its title. `bun verify boxxy session-item` checks
  both.
- A tick claimed the item, the session's start hook bound the session to the attempt, the server
  took the close-out, and two ticks settled the attempt. When one of these fails,
  `bun verify action run-session` exits 1 with `check-failed`. Read the evidence to find the step.
- The build `succeeded` with the outcome `built`. In `bun verify action run-session`, the server
  refused the check `nightly / lint` because no check run has that name, recorded `pr / checks` and
  `file-item` at the pull request's head, and took a close-out that cites both. When one of these
  fails, the action exits 1 with `check-failed`.
- Each `bun verify boxxy evidence` exits 0: the evidence row carries the head
  `5e0f1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b` that the server read.
