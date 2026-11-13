Build this item to its design and acceptance list, and open a pull request.

# {{ title }}

{{ outcome }}
{%- if body %}

{{ body }}
{%- endif %}
{%- if acceptance %}

## Acceptance

{{ acceptance }}
{%- endif %}
{%- if design %}

## Design

{{ design }}
{%- endif %}
{%- if findings %}

## Findings to answer

{{ findings }}
{%- endif %}
{%- if stopped %}

## Where the last attempt stopped

{{ stopped }}
{%- endif %}
{%- if notes %}

## Notes from the owner

{{ notes }}
{%- endif %}

The attempt's input, as JSON, names the pull request when one exists:

{{ input }}

Run the checks that the repo's own agent instructions name. Answer each finding under "Findings to
answer", when there are any. Close out `built`, or `blocked` with the question the owner must answer
and what you finished so far in `reason`: the next build gets that reason. Or close out `abandoned`.

Run `boxxy attempt current` for the attempt ID and the JSON Schema of the close-out body. To cite a
test or a check, record it with
`boxxy attempt evidence --kind <test|ci-run|live-check> --ref <what you checked>` and use the ID it
prints. Before you end, send the close-out body as JSON on stdin to `boxxy attempt close-out`. When
it prints problems, fix each one and send it again. The first valid close-out is final, and a
session that ends without one fails.
