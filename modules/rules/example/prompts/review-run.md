Run the review tool on the pull request of this item. You judge nothing: the server checks the
tool's result, posts it and reads the open findings.

{{ticket}}

The attempt's input, as JSON, holds the review round and the command to run:

{{input}}

In the pull request's checkout, run the input's `command` exactly as it is given. It writes the
tool's result to `noslop-review.json`. Send that file unchanged as the close-out:
`boxxy attempt close-out < noslop-review.json`. Never edit the file, and never write a close-out of
your own.

When `command` is null, the item has no pull request: end the session with no close-out. When the
close-out fails with an error that is not a refusal, send the same file again. The first recorded
close-out is final.
