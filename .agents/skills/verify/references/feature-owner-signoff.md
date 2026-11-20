# owner-signoff

Run this journey to check that the owner signs off a pull request that edits a matched path before
boxxy merges it. The rules the harness loads for this journey hold one sign-off rule, `skills`,
which matches `skills/testing/SKILL.md`. The owner reads the waiting items with
`boxxy signoff list`, and answers one with `boxxy item signoff <item> --head <head> --verdict`.

`action hold-at-signoff` files an item, builds it, passes its review at the head
`e83c5163316f89bfbde7d9ab23ca2e25604af290`, and runs a merge attempt that holds the item for the
owner, because its pull request edits the matched path. The item becomes the current item.
`action push-commit` pushes the commit `a1b2c3d4e5f60718293a4b5c6d7e8f9012345678` to that pull
request, as the build that answers the findings does.

## Journey

```bash
bun verify use --feature owner-signoff
bun verify action hold-at-signoff
bun verify boxxy signoff --count 1 --head e83c5163316f89bfbde7d9ab23ca2e25604af290 --rule skills --path skills/testing/SKILL.md
bun verify action signoff-item --verdict send-back --head e83c5163316f89bfbde7d9ab23ca2e25604af290 --findings "The new rule contradicts the old one."
bun verify action tick --minutes 1
bun verify boxxy merges --outcomes needs-signoff,changes-requested
bun verify action run-session --close-out built --minutes 6
bun verify boxxy prompt --phase build --text "The new rule contradicts the old one."
bun verify action push-commit
bun verify action run-session --close-out passed --minutes 4 --head a1b2c3d4e5f60718293a4b5c6d7e8f9012345678
bun verify action tick --minutes 1
bun verify boxxy signoff --count 1 --head a1b2c3d4e5f60718293a4b5c6d7e8f9012345678 --rule skills --path skills/testing/SKILL.md
bun verify action signoff-item --verdict approve --head a1b2c3d4e5f60718293a4b5c6d7e8f9012345678
bun verify action tick --minutes 1
bun verify action tick --minutes 1
bun verify boxxy merges --outcomes needs-signoff,changes-requested,needs-signoff,merged
bun verify boxxy signoff --count 0
```

## End state

- The first `bun verify boxxy signoff` exits 0: the item waits for a sign-off at the head, with the
  rule `skills` and the path that matched.
- The first `bun verify boxxy merges` exits 0: the send-back finished the merge attempt
  `changes-requested`, and no merge ran.
- `bun verify boxxy prompt` exits 0: the build that the send-back started carries the owner's text
  in its launch prompt.
- The second `bun verify boxxy signoff` exits 0: the next head waits, because the owner's send-back
  covered the head before it. The second `bun verify boxxy merges` exits 0: the approval at that
  head let the merge through, and the item merged.
- The last `bun verify boxxy signoff` exits 0: no item waits.
