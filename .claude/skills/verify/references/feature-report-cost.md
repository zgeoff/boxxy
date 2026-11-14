# report-cost

The owner reads what a merged item cost with `boxxy cost <item>`, and the minutes of each step with
`boxxy times <item>`, where `<item>` is the item's id. boxxy reads both from pepys.

The journey lands one item with `action land-item`, which takes it through triage, design, build,
review and the merge. Then it reads the cost and the step times of that item.

## Journey

```bash
bun verify use --feature report-cost
bun verify action land-item --title "Show the theme in the header"
bun verify boxxy cost --requests 2 --usd 3
bun verify boxxy times --step build --minutes 30
bun verify boxxy times --step merge --minutes 20
```

## End state

- `boxxy cost` exits 0: pepys holds 2 model requests that cost 3 USD in all.
- Each `boxxy times` exits 0: the build step took 30 minutes, and the merge step took 20.
- `land-item` sets each of these numbers: a model request of 1 USD in the build and one of 2 USD in
  the review, a build of 30 minutes, and a merge 20 minutes after the review.
