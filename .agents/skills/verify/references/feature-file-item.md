# file-item

Run this journey to check that boxxy stores the title of an item the owner files. The owner files an
item with `boxxy item file`, and reads it with `boxxy item show`. `action file-item` runs
`boxxy item file` and makes the new item current. `bun verify boxxy item` runs `boxxy item show` on
the current item, and compares its title with `--title`. With `--by-ref`, it then runs
`boxxy item show` on the short reference of that item, such as `i-1`, and compares the ID it shows.

## Journey

```bash
bun verify use --feature file-item
bun verify action file-item --title "Follow the system theme"
bun verify boxxy item --title "Follow the system theme" --by-ref
```

## End state

- `bun verify action file-item` exits 0: `boxxy item file` answered with a short reference of the
  form `i-<n>` beside the item ID. It exits 1 when the boxxy server refuses the item or answers no
  reference.
- `bun verify boxxy item` exits 0: boxxy shows the title that `action file-item` filed, with a short
  reference of the form `i-<n>`, and `boxxy item show` on that reference shows the same item.
