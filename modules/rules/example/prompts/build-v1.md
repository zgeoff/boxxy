Build this item to its design and acceptance list, and open a pull request.

{{ticket}}

Run the checks that the repo's own agent instructions name. Fix each finding under "Findings to
fix", when there are any. Close out `built`, `blocked` with the question the owner must answer, or
`abandoned`.

Run `boxxy attempt current` for the attempt ID and the JSON Schema of the close-out body. To cite a
test or a check, record it with
`boxxy attempt evidence --kind <test|ci-run|live-check> --ref <what you checked>` and use the ID it
prints. Before you end, send the close-out body as JSON on stdin to `boxxy attempt close-out`. When
it prints problems, fix each one and send it again. The first valid close-out is final, and a
session that ends without one fails.
