# runner-pause

This journey proves that boxxy starts no attempt while the owner has paused the runner, and starts
one after the owner resumes it. The owner runs `boxxy runner pause` and `boxxy runner resume`, and
reads the runner's state with `boxxy status`. `action runner-pause` and `action runner-resume` run
the two owner commands.

When a command fails between `action runner-pause` and `action runner-resume`, the runner stays
paused, and no later journey on the run gets an attempt. Run `bun verify action runner-resume`
before you run any other journey.

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

- While the runner is paused, the first `bun verify boxxy attempts` exits 0: the tick started no
  attempt. `bun verify boxxy status --state paused` exits 0.
- After the resume, the last `bun verify boxxy attempts` exits 0: the tick started the item's first
  attempt, in triage. `bun verify boxxy status --state running` exits 0.
