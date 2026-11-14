# report-cost

An item whose pull request merged reports its cost and its stage times from pepys. A user reaches it
with `boxxy cost <item>` and `boxxy times <item>`.

## Journey

```bash
bun verify use --feature report-cost
bun verify action land-item --title "Show the theme in the header"
bun verify boxxy cost --requests 2 --usd 3
bun verify boxxy times --step build --minutes 30
bun verify boxxy times --step merge --minutes 20
```

## End state

Each read exits 0: pepys reports 2 model requests that cost 3 USD in all, a build step of 30 minutes
and a merge step of 20, the numbers that `land-item` scripts on the harness clock.
