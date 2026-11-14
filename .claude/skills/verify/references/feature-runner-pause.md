# runner-pause

The owner pauses the runner with `boxxy runner pause`, and boxxy starts no attempt until
`boxxy runner resume`. `boxxy status` shows the runner as `paused` or `running`. The journey pauses
the runner, files an item and runs a tick, then resumes the runner and runs another tick.

When the journey fails between `runner-pause` and `runner-resume`, the runner stays paused, and each
later journey on the run claims nothing. Run `bun verify action runner-resume` before you go on.

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

- While the runner is paused, the first `boxxy attempts` exits 0, because the tick started no
  attempt, and `boxxy status` shows `paused`.
- After the resume, the last `boxxy attempts` exits 0, because the tick started one triage attempt,
  and `boxxy status` shows `running`.
