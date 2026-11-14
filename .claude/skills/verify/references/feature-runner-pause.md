# runner-pause

The owner pauses the runner with `boxxy runner pause`, and it starts no attempt until
`boxxy runner resume`. `boxxy status` shows which of the two it is.

## Journey

```bash
bun verify use --feature runner-pause
bun verify action runner-pause
bun verify action file-item --title "Remember the window size"
bun verify action tick
bun verify boxxy attempts --title "Remember the window size" --count 0
bun verify boxxy status --state paused
bun verify action runner-resume
bun verify action tick
bun verify boxxy attempts --title "Remember the window size" --count 1 --phase triage
bun verify boxxy status --state running
```

## End state

Each read exits 0: while the runner is paused, a tick leaves the item with no attempt and `status`
shows `paused`. After the resume, the next tick gives the item one triage attempt and `status` shows
`running`. A journey that fails between the pause and the resume leaves the runner paused: run
`bun verify action runner-resume`.
