Triage this item.

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

Decide whether boxxy takes it on, and close out with one of these results:

- `accepted` when boxxy should do the work. An accepted item needs an acceptance list. Accept no
  criterion that only a release or a live run can prove.
- `duplicate`, with the other item in `of`, when another item asks for the same work.
- `needs-owner`, with the question in `question`, when only the owner can decide, such as a choice
  of scope or a missing fact. The item waits for the owner's answer. The next triage gets your
  question under "Where the last attempt stopped", and the answer under the notes or in the body.
- `split`, with each part in `openItems`, when the item holds several pieces of work that can each
  be done alone. boxxy files each part as a new item, and this item ends.
- `declined`, with the reason, when boxxy should not do the work at all. Never decline to ask a
  question or to split an item.

To rewrite the body, send the whole new body in `set.body`. Later phases get it in place of this
one.

Run `boxxy attempt current` for the attempt ID and the JSON Schema of the close-out body. To cite a
test or a check, record it with
`boxxy attempt evidence --kind <test|ci-run|live-check> --ref <what you checked>` and use the ID it
prints. Before you end, send the close-out body as JSON on stdin to `boxxy attempt close-out`. When
it prints problems, fix each one and send it again. The first valid close-out is final, and a
session that ends without one fails.
