# Feature map

Each journey runs as written after `bun verify up` and `bun verify doctor`. Each files its own item,
so the three run in any order on one run.

## file-item

- **What:** the owner files an item, and boxxy shows it.
- **How a user reaches it:** `boxxy item file`, then `boxxy item show <item>`.
- **Journey:**

  ```bash
  bun verify use --feature file-item
  bun verify action file-item --title "Follow the system theme"
  bun verify boxxy item --title "Follow the system theme"
  ```

- **End state:** `boxxy item` exits 0. It exits 1 with `check-failed` when `item show` gives another
  title. `file-item` exits 1 when the server refuses the item.

## claim-settle

- **What:** boxxy claims a filed item for triage, a worker session binds and closes out, and the
  attempt settles with that outcome. The session reads another item of its repo.
- **How a user reaches it:** the owner files an item; the runner tick does the rest. A triage
  session runs `boxxy attempt list-items` and `boxxy attempt show-item` to look for a duplicate.
- **Journey:**

  ```bash
  bun verify use --feature claim-settle
  bun verify action file-closed-item --title "Read the theme from the desktop"
  bun verify action file-item --title "Read the system theme"
  bun verify action run-session --close-out accepted --minutes 4
  bun verify boxxy session-item --text "theme from the desktop" --title "Read the theme from the desktop"
  bun verify boxxy item --title "Read the system theme" --phase triage --outcome accepted
  ```

- **End state:** `boxxy session-item` exits 0: the session lists one item with the text, and shows
  its title. `boxxy item` exits 0: the item's triage attempt is `succeeded` with the outcome
  `accepted`. `run-session` fails with `check-failed` when no tick claims the item, the hook does
  not bind, the close-out is refused, or two ticks do not settle the attempt.

## report-cost

- **What:** an item whose pull request merged reports its cost and its stage times from pepys.
- **How a user reaches it:** `boxxy cost <item>` and `boxxy times <item>`.
- **Journey:**

  ```bash
  bun verify use --feature report-cost
  bun verify action land-item --title "Show the theme in the header"
  bun verify boxxy cost --requests 2 --usd 3
  bun verify boxxy times --step build --minutes 30
  bun verify boxxy times --step merge --minutes 20
  ```

- **End state:** each read exits 0: pepys reports 2 model requests that cost 3 USD in all, a build
  step of 30 minutes and a merge step of 20, the numbers that `land-item` scripts on the harness
  clock.
