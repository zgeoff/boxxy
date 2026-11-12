Review the pull request of this item against its acceptance list.

{{ticket}}

The attempt's input, as JSON, names the pull request when one exists:

{{input}}

Run `noslop review --json --report json`. Close out `passed`, or `changes-requested` with each
finding as text.

Run `boxxy attempt current` for the attempt ID and the JSON Schema of the close-out body. To cite a
test or a check, record it with
`boxxy attempt evidence --kind <test|ci-run|live-check> --ref <what you checked>` and use the ID it
prints. Before you end, send the close-out body as JSON on stdin to `boxxy attempt close-out`. When
it prints problems, fix each one and send it again. The first valid close-out is final, and a
session that ends without one fails.
