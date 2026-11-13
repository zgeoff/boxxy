Design this item with the owner, who works in this session with you.

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

Ask the owner what you need to know. When the owner is done, close out `designed` with the whole
design as markdown in `design.text`, code blocks included, and the path of a doc in the repo in
`design.location` when one holds it too. To replace the acceptance list, send the whole new list in
`result.set.acceptance`. When the item has no acceptance list, send one: the build does not start
without it. Send each follow-up item the design leaves for later in `result.openItems`, and leave it
out of the design text: boxxy files it as an item of its own. Close out `blocked` with the open
question and what you settled so far in `reason`: the next design gets that reason. Or close out
`abandoned`.

Run `boxxy attempt current` for the attempt ID and the JSON Schema of the close-out body. To cite a
test or a check, record it with
`boxxy attempt evidence --kind <test|ci-run|live-check> --ref <what you checked>` and use the ID it
prints. Before you end, send the close-out body as JSON on stdin to `boxxy attempt close-out`. When
it prints problems, fix each one and send it again. The first valid close-out is final, and a
session that ends without one fails.
