# API and auth in v1

One contract holds every v1 procedure, and the server serves it through three doors: an RPC route for the CLI, an MCP endpoint for the owner's agent, and a second MCP endpoint for an agent inside a session. A table beside the contract says who each procedure is for. A worker session reaches the server through a broker that adds a bearer token, and that token may call only the session and hook procedures. Every session and hook call also needs a proven caller, and the server refuses the call when it cannot prove one. [`01-api.ts`](./sketches/v1/edge/01-api.ts) holds the contract, the access table and the auth rules.

## The three doors

```mermaid
flowchart LR
  cli[the CLI] --> rpc["/rpc"]
  owner[the owner's agent] --> mcp["/mcp: 17 tools"]
  session[an agent in a session] --> broker[the impd broker]
  broker --> rpc
  broker --> smcp["/mcp/session: 3 tools"]
  rpc --> router[one router]
  mcp --> router
  smcp --> router
```

The contract lives in the package `@boxxy/contract`, and the server builds one router from it on oRPC v2. Section A of [`01-api.ts`](./sketches/v1/edge/01-api.ts) shows the server, the CLI client and an MCP call. [The CLI and the hooks](./v1-cli.md) covers the CLI. The server opens two listeners, each on an address that the configuration file sets:

- The owner listener sits on the owner's private network. It serves `/rpc`, `/mcp` and `/healthz`.
- The worker listener is the broker's target. It serves `/rpc` and `/mcp/session`, and answers 401 on any path, unknown ones included, to a request without the worker token.

Both listeners refuse a body over 256 KiB with 413, on every path, `/healthz` included. The server counts the bytes as it reads the body, so a streamed body with no length header gets the same limit.

Both listeners refuse with 403 a request that a browser page sent: one with an `Origin` header, or a `Sec-Fetch-Site` header other than `none`. No caller of the server is a page. The owner listener takes no token, so without this check a page on any site could send it a write: a browser sends a `text/plain` POST with no CORS preflight, and a site whose name resolves to the listener's address passes for the same origin.

Section B holds the rules of the contract. Four of them shape every procedure:

- A procedure is `<group>.<verb>`, and its MCP tool is `<group>_<verb>`. The tool name is set on the procedure, so a renamed router key never renames a tool.
- A contract schema has no transform. An ID is a plain string on the wire, and the handler brands it.
- An answer that a caller acts on in its normal flow is a member of the output union. A call that names a thing that does not exist throws a typed error.
- The server accepts the previous version of the CLI, because the CLI is in the agent image and an image update can lag a server deploy. A release removes and renames nothing that the previous CLI sends or reads.

## The procedures

Section C of [`01-api.ts`](./sketches/v1/edge/01-api.ts) holds the input, the output and the errors of each procedure, and section D holds the access table. The table below gives who may call each one. "Owner" is a call on the owner's path. "Session" and "hook" are calls through the broker, with the worker token and a proven caller.

| Procedure | Caller | MCP tool | What it does |
| --- | --- | --- | --- |
| `item.file` | owner | owner | files an item |
| `item.edit` | owner | owner | replaces the given fields of an item |
| `item.close` | owner | owner | closes an item and ends its live attempt; with `of`, as a duplicate |
| `item.retry` | owner | owner | lifts a hold and resets the attempt counts; with `phase`, sets the position |
| `item.wake` | owner | owner | asks boxxy to wake the item's sleeping session |
| `item.note` | owner | owner | appends a note |
| `item.get` | owner | owner | returns one item with its position, notes, attempts and pull requests |
| `item.list` | owner | owner | lists items, with filters for state, repo, phase, text and label |
| `relation.add` | owner | owner | adds a relation between two items |
| `relation.remove` | owner | owner | removes a relation |
| `plan.defer` | owner | owner | holds an item back from dispatch |
| `plan.undefer` | owner | owner | ends a deferral |
| `plan.expedite` | owner | owner | puts items at the front of their pools |
| `plan.unexpedite` | owner | owner | ends an expedite |
| `runner.status` | owner | owner | returns the limits, the live attempts, the strays, unsent notices and the outbox state |
| `report.cost` | owner | owner | returns what one item cost, from pepys |
| `report.stageTimes` | owner | owner | returns the time of one item in each of seven steps, from pepys |
| `attempt.current` | session | session | returns the attempt of the calling session, with the schema of its close-out |
| `attempt.evidence` | session | session | records one piece of evidence |
| `attempt.closeOut` | session | session | sends the close-out |
| `attempt.bindSession` | hook | none | binds the agent session; reports missing skills |
| `attempt.recordPullRequest` | hook | none | links a pull request to the attempt |
| `runner.pause` | owner | none | pauses the runner |
| `runner.resume` | owner | none | resumes the runner |
| `outbox.retry` | owner | none | clears the park mark of every parked outbox row |
| `rules.dryRun` | owner | none | shows where each open item would stand under a rules file |

- **17 owner tools.** The owner's agent files and steers work for the owner, so it gets every command on an item and every read.
- **3 session tools, on their own endpoint.** A session's tool list holds no command on another item. A session reports found work in its close-out, where settle dedupes it.
- **6 procedures with no tool.** A hook program calls two of them. Three switch the whole server and write no fact that shows who did it, so they stay with a person at the CLI. The rules dry run takes a whole file.
- **A test keeps the access table in step with the contract.** It fails when a procedure has no entry, when an entry names no procedure, or when a tool has no name.

`attempt.current` tells the agent which of the four close-outs its attempt takes: the phase, the JSON Schema of the body, and the outcome names. It also returns the skills to fetch and the item's notes.

## The two paths

Section E of [`01-api.ts`](./sketches/v1/edge/01-api.ts) holds the two paths, the scope of the worker token and the rule of the proven caller.

| Path | Who | How the server knows |
| --- | --- | --- |
| the owner's path | the owner, the CLI and the owner's agent | the request arrives on the owner listener, with no token |
| the worker path | a session and its hooks | the request arrives through the impd broker, which adds the worker bearer token, on either listener |

A worker session runs in an imp, which reaches the public internet only. The session calls a made-up host, and the broker sends the request to the boxxy server and adds the bearer token. The session never holds the token. It gets the address as `BOXXY_URL` from an atc auth profile.

## The scope of the worker token

The security rule at the top of section E of [`01-api.ts`](./sketches/v1/edge/01-api.ts) sets the scope. A request with the worker bearer token may call only the procedures whose caller is `session` or `hook`. Every owner procedure answers `FORBIDDEN`. A wrong token gets 401 on every procedure.

One root middleware does this from the access table, for the RPC route and both MCP endpoints, and no handler repeats the check. A session therefore cannot close an item, retry one or pause the runner, although the broker carries any path.

A session on a local worker target reaches the server on the owner's path and can call every owner procedure. v1 accepts that, because v1 workers run on the cloud target. Such a session can call no session or hook procedure, because it has no proven caller.

## The proven caller

Every session and hook procedure needs a proven caller, the hook that binds a session included. The bearer token proves only that a call came through the broker. The proof says who sent it.

1. The root middleware asks the `CallerProof` port to prove the request. The port answers with a caller identity, which is an issuer and a subject, or with nothing. With nothing, the server answers 401.
2. The server finds the session in its own store: the atc session whose latest attempt row holds that caller. The runner records the caller on the attempt row from the worker's answer. When the store holds no such session, the answer is `no-attempt`. When two sessions match, the answer is `FORBIDDEN`.
3. The handler gives the core the attempt ID from the request, and the session and the caller from steps 1 and 2. The core accepts the call only when the named attempt is the latest one that the session carries and that attempt's own row holds the proven caller.

No branch skips a step, and a check that the server cannot make is a refusal. The server never takes the session from the request: a session that could name a session could name another one. The core compares two caller identities for equality and knows nothing more about them.

The port has three adapters:

| Adapter | Use |
| --- | --- |
| the imp identity verifier | v1. It reads the `Imp-Identity` header, a short-lived token that the broker signs, and gives the token's issuer and subject. It imports the verifier from `@impz/client/identity`, which impz builds |
| a fake | tests set who the next request is from |
| none | the server uses it when its configuration has no `trustedIssuers` section, which names the trust document folders and the audience, so every session and hook call is refused |

Section F of [`01-api.ts`](./sketches/v1/edge/01-api.ts) says what the server checks on the token. The broker removes any such header that a guest sends and adds its own.

The package `@boxxy/caller-proof-imp` holds the verifier adapter, `impIdentityCallerProof({ issuers, audience, clock })`. It reads the `imp-identity` header and gives the token's issuer, and the machine ID as the subject: the same ID that atc reports for the session's host, which the runner stores as the caller. The imp's name is never the subject.

The adapter reads no file: the server reads every file in the folders of `trustedIssuers.folders`, parses each as JSON, and passes the list with `trustedIssuers.audience`. A missing folder or a file that is not JSON refuses the start, and a bad document, or two documents for one issuer, makes the adapter throw, so the server does not start either. With no document or an empty audience, the adapter proves no request. Only this adapter and the atc worker adapter name the imp or its token, apart from the one place in the server that builds the adapter; every other package sees an issuer and a subject.

The adapter does not call the library's session check, `checkSessionImp`. That check compares the issuer and the machine ID of the caller with the host of a session. The server already makes the same comparison in step 2, when it finds the session by the caller, and the core makes it again on the attempt's own caller in step 3. A third check would add nothing, and a second definition of "the same machine" could drift from the store's.

The proven caller depends on two things outside this repo: an impz broker that signs each call with the identity token, and a broker rule that signs calls to the boxxy host. atc reports the VM host of a session from release 7.13.0. Until both are in place, the server refuses every session and hook call. [Open for the builder](./v1-open.md#needs-work-outside-this-repo) lists them.

A test walks every procedure three ways: with the worker token against every owner procedure, with a missing or wrong proof against every session and hook procedure, and with one session's proof and another session's attempt ID. Each case must leave every row as it was. Section D of [`01-api.ts`](./sketches/v1/edge/01-api.ts) lists the cases.
