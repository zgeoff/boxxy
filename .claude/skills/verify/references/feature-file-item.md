# file-item

The owner files an item, and boxxy shows it. A user reaches it with `boxxy item file`, then
`boxxy item show <item>`.

## Journey

```bash
bun verify use --feature file-item
bun verify action file-item --title "Follow the system theme"
bun verify boxxy item --title "Follow the system theme"
```

## End state

`boxxy item` exits 0. It exits 1 with `check-failed` when `item show` gives another title.
`file-item` exits 1 when the server refuses the item.
