# owner-mcp

Run this journey on `local` to check that an MCP client with no person at the keyboard can call the
owner's MCP tools, such as `item_file`. The server serves those tools to outside clients at its
public door, an MCP endpoint with an OAuth server in front. The client signs in as a service client:
it trades a client ID and secret for an access token. The `mcp` commands sign in for you, so you
never pass a token.

Start the run with `bun verify up`, as for every journey. `up` mints a service client with the read
and write scopes, and the harness serves the public door beside the app.

- Keep the `held` field in the `item_file` line. The runner never starts work on a held item, so the
  item stays put while you run the other journeys.
- Check `data.isError` on each `mcp call`. When a tool fails, the command still exits 0 with
  `ok: true`, and gives `data.isError: true` with the reason in `data.content`. Treat that as a
  failed journey command.
- `item_file` gives the new item's ID as a string in `data.structuredContent.item`. Put that string
  in place of `<item>` in the `item_get` line.

## Journey

```bash
bun verify use --feature owner-mcp
bun verify mcp tools
bun verify mcp call item_file --args '{"repo":"example/app","title":"Show the queue depth","outcome":"The status page shows how many items wait.","held":{"reason":"The owner-mcp journey filed it."}}'
bun verify mcp call item_get --args '{"item":"<item>"}'
bun verify mcp call item_list --args '{"state":"held","text":"queue depth"}'
```

## End state

Each field below sits under `data`.

- `mcp tools` gives `server: "boxxy"` and the owner's tools, `item_file` among them. Each tool that
  the [access table](../../../../libs/contract/src/access.ts) puts in the `read` scope has
  `inReadTools: true`, and every other tool has `false`.
- `mcp call item_file` gives `isError: false`, and the new item's ID in `structuredContent.item`.
- `mcp call item_get` gives `isError: false`, and an item object in `structuredContent.item` with
  that `id`, the `title` `Show the queue depth`, and `derived.state` `held`.
- `mcp call item_list` gives `isError: false`, and `structuredContent.items` holds that item.

## On prod

After a deploy, run these steps on `prod`, the deployed public door. The `prod` target refuses every
command that changes state, and keeps its evidence in `.wringer/`, because the deployed items name
private repos. Never run `bun verify publish` with a `prod` verdict: the report would reach the PR
description. When a step fails, give its `data` or `error` in your reply, skip step 5, and still run
step 6.

1. Run `bun verify use --target prod`, then `bun verify use --feature owner-mcp`.
2. Read the door's origin and the secret of the read-scope client `service:wringer-ro` from the item
   `boxxy verify prod mcp client` in the `boxxy` vault of 1Password. Set both on the `attach` line
   only, and never print the secret:

   ```bash
   item='op://boxxy/boxxy verify prod mcp client'
   origin="$(op read "$item/origin")" && secret="$(op read "$item/credential")" &&
     BOXXY_PROD_ORIGIN="$origin" BOXXY_PROD_MCP_SECRET="$secret" bun verify attach
   unset secret
   ```

   Expect: `ok: true` and `data.status` `running`. When `op read` fails, `attach` doesn't run: stop
   and give the `op` error in your reply. The run's background process holds the secret, and signs
   in for each later command.

3. Run `bun verify doctor`. Expect: `data.passed: true`. On `prod`, the doctor reports the `boxxy`
   check as `skipped`, because it tests the local harness. The other checks test the door:
   - `mcp-door` reads the door's OAuth metadata at `/.well-known/oauth-protected-resource/mcp`. When
     it fails, the deployed server runs with no public door, or at another URL.
   - `mcp-sign-in` signs the client in and lists the tools. When it fails, the deployed server's
     service-token file lacks the client's digest, or the secret is wrong.

4. Run the reads below. Take the ID from `data.structuredContent.items[0].id` of the `item_list`
   call, and put it in place of `<item>`. When `item_list` gives no items, skip `item_get`.

   ```bash
   bun verify mcp tools
   bun verify mcp call runner_status
   bun verify mcp call item_list --args '{"limit":5}'
   bun verify mcp call item_get --args '{"item":"<item>"}'
   ```

   Expect: `mcp tools` gives `server: "boxxy"`, with `inReadTools: true` on `runner_status`,
   `item_list` and `item_get`. Each call gives `isError: false`. `runner_status` gives
   `structuredContent.paused`, `true` or `false`, and `item_get` gives the item with that `id` in
   `structuredContent.item`.

5. Run `bun verify done` to record the `prod` verdict. Expect: `ok: true`.
6. Run `bun verify detach`, then `bun verify use --target local`. `detach` stops the background
   process and deletes the run's copy of the secret.
