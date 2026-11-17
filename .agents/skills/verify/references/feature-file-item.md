# file-item

Run this journey to check that boxxy stores the title of an item the owner files. The owner files an
item with `boxxy item file`, and reads it with `boxxy item show`. `action file-item` runs
`boxxy item file` and makes the new item current. `bun verify boxxy item` runs `boxxy item show` on
the current item, and compares its title with `--title`.

## Journey

```bash
bun verify use --feature file-item
bun verify action file-item --title "Follow the system theme"
bun verify boxxy item --title "Follow the system theme"
```

## End state

- `bun verify action file-item` exits 0. It exits 1 when the boxxy server refuses the item.
- `bun verify boxxy item` exits 0: boxxy shows the title that `action file-item` filed.
