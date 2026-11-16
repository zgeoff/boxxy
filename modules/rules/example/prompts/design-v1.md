Design this item against its acceptance list, or write the list when it has none.

# {{ title }}

{{ outcome }}
{%- if body %}

{{ body }}
{%- endif %}
{%- if acceptance %}

## Acceptance

{{ acceptance }}
{%- endif %}
{%- if stopped %}

## Where the last attempt stopped

{{ stopped }}
{%- endif %}
{%- if notes %}

## Notes from the owner

{{ notes }}
{%- endif %}

Close out `designed` with the whole design as markdown in `design.text`, code blocks included, and
the path of a doc in the repo in `design.location` when one holds it too. When the item asks
questions, such as an investigation, put the answers in markdown in `result.conclusion`, and keep
how you found them in the design: the build gets both. To replace the acceptance list, send the
whole new list in `result.set.acceptance`. When the item has no acceptance list, send one: the build
does not start without it. Send each follow-up item the design leaves for later in
`result.openItems`, and leave it out of the design text: boxxy files it as an item of its own. Give
each one its item `kind`, such as `core.issue`, and `security: true` when its work concerns a
security weakness. When one piece of work must merge before another, set that order on the open
items: boxxy builds nothing before the work it waits on. Give an open item a `key` of lowercase
letters, digits and hyphens that starts with a letter or a digit, other than `item` and different
from each other open item's key. List the items that wait on it in `blocks`, and the items it waits
on in `blockedBy`. Name this item as `item`, and another open item by its key. For example, a
scaffold that both this item and an alerts item need is
`{ "key": "scaffold", "blocks": ["item", "alerts"], ... }`. The links must make no loop. Close out
`blocked` with the question the owner must answer and what you settled so far in `reason`: the next
design gets that reason, and the owner's answer in the notes. When the design can go on only after
another item is done, also add `{ "type": "blocks", "source": "<the other item's ID>" }` to
`result.relations`: boxxy starts no work on this item until the other one is done. Or close out
`abandoned`.

Run `boxxy attempt current` for the attempt ID and the JSON Schema of the close-out body. To cite a
test or a check, record it with
`boxxy attempt evidence --kind <test|ci-run|live-check> --ref <what you checked>` and use the ID it
prints. Before you end, send the close-out body as JSON on stdin to `boxxy attempt close-out`. When
it prints problems, fix each one and send it again. The first valid close-out is final, and a
session that ends without one fails.

When you wait for something, such as CI or a background task, you may end your turn, but wake at
least every 30 minutes to check on it. boxxy fails a session that shows no activity for longer than
its silence limit.
