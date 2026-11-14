# file-item

The owner files an item with `boxxy item file`, and reads it back with `boxxy item show <item>`,
where `<item>` is the id that `item file` prints. The journey files one item and checks the title
that boxxy shows.

## Journey

```bash
bun verify use --feature file-item
bun verify action file-item --title "Follow the system theme"
bun verify boxxy item --title "Follow the system theme"
```

## End state

- `action file-item` exits 0. It exits 1 when the server refuses the item.
- `boxxy item` exits 0: `boxxy item show` gives the title that `file-item` filed. It exits 1 with
  `check-failed` when the title differs.
