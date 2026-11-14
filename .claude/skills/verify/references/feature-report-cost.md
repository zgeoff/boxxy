# report-cost

Run this journey to check that boxxy reports the cost and the step times of a merged item from
pepys, the service that stores them. The owner reads them with `boxxy cost <item>` and
`boxxy times <item>`, where `<item>` is the item's id. `action land-item` files an item, takes it
through each phase to the merge, and makes it current. The two reads run `boxxy cost` and
`boxxy times` on the current item, and compare each number with a flag.

`action land-item` sets every number the reads expect: a model request of 1 USD in the build and one
of 2 USD in the review, a build of 30 minutes, and a merge 20 minutes after the review. Keep the
flags as written.

## Journey

```bash
bun verify use --feature report-cost
bun verify action land-item --title "Show the theme in the header"
bun verify boxxy cost --requests 2 --usd 3
bun verify boxxy times --step build --minutes 30
bun verify boxxy times --step merge --minutes 20
```

## End state

- `bun verify boxxy cost` exits 0: pepys holds 2 model requests, 3 USD in all.
- Each `bun verify boxxy times` exits 0: the build step took 30 minutes, and the merge step 20.
