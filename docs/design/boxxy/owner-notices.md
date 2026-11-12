# Notice delivery in production

- **Status:** draft

The owner learns of a hold from a notice: a message that the deployed server sends through [atc](https://github.com/zgeoff/atc), the tool that runs agent sessions, to one session, the owner's notice session. This design gets each notice to that session even while the session or the owner's machine sleeps, and lets the owner rename the session with no change to boxxy. The review-and-merge design (`review-and-merge.md`) owns the hold reasons and the text of each notice. [Notices in v1](./v1.md#notices) says which holds write a notice.

Terms this doc uses:

- **settle:** the store change that ends an attempt. When it leaves the item on hold, it writes one row in the `notices` table.
- **tick:** one pass of the server's runner loop, every 5 seconds. Each tick sends the notices that are due.
- **target:** a place where atc runs sessions, such as the owner's machine or a worker machine.
- **grant:** an entry in an atc daemon's config that lets one caller, such as the server's token, reach the sessions on the targets it names.

## The path of a notice

```mermaid
flowchart LR
  settle["a settle puts the item on hold"] --> row["a row in the notices table"]
  row --> tick["a tick picks the rows that are due"]
  tick --> notifier["the atc notifier, with the notice token"]
  notifier -->|"atc_message_send"| gateway["atc gateway"]
  gateway --> session["the owner's notice session"]
  gateway -.->|"refused or uncertain: the row waits for its next try"| row
```

## Contracts

### The notice session in the configuration

atc addresses a session only by its gateway ID, `<daemon>.<incarnation>.<id>`, and never by its name: the gateway answers `no_such_session` to any other value. The server's configuration therefore holds the ID.

```ts
// apps/server, the configuration file's `atc` section; `notices` replaces the key `noticeSession`
const atcSection = z.strictObject({
  // …existing fields
  notices: z
    .strictObject({
      // the notice session's gateway ID, as `atc_sessions_list` prints it through the gateway
      session: z.string().regex(/^[^.]+\.[^.]+\..+$/u),
    })
    .optional(), // with none, the server sends no notice and marks each row sent
});
```

- The notifier calls atc with the notice token, from `BOXXY_ATC_NOTICE_TOKEN`, and with no other token. The server's other atc calls, which start and stop worker sessions, use the worker token, from `BOXXY_ATC_TOKEN`.
- When `notices` is set and `BOXXY_ATC_NOTICE_TOKEN` is empty, the server refuses to start.

### The notices row and the port

```ts
// @boxxy/model
interface NoticeRow {
  // …existing fields: id, item, reason, at, tries, sentAt
  readonly keySeq: number; // the row's current key is `boxxy-notice:<id>:<keySeq>`
  readonly keyTries: number; // uncertain tries under the current key; 0 after each change of key
  readonly nextTryAt: Instant; // a tick sends the row once now >= nextTryAt; a new row holds its `at`
}

// @boxxy/model, the Notifier port
interface Notifier {
  tellHold: (notice: HoldNotice) => Promise<NoticeOutcome>;
}

interface HoldNotice {
  // …the notice's content, which the review-and-merge design owns
  readonly key: string; // the row's current key; the adapter sends it unchanged
}

type NoticeOutcome =
  | { readonly kind: 'sent' }
  | { readonly kind: 'refused'; readonly reason: string } // atc ran nothing
  | { readonly kind: 'uncertain'; readonly reason: string }; // atc may have sent the message
```

The atc adapter maps `no_such_session`, `session_dead`, `unsupported`, `daemon_unavailable` and `bad_args` to `refused`. It maps every other error to `uncertain`, including `outcome_unknown` and `idempotency_conflict`. The adapter keeps no state between calls.

`sendNotices`, in `@boxxy/dispatch`, builds each row's key, calls the port, and updates the row once per try:

1. On `sent`, `sendNotices` sets `sentAt`.
2. On `refused` while `keyTries` is 0, `sendNotices` adds 1 to `keySeq`. The gateway answers any later call under a refused key without sending, so the next try needs a new key.
3. On `uncertain`, or on `refused` while `keyTries` is above 0, `sendNotices` adds 1 to `keyTries`. The next try repeats the key. When the first send reached the atc daemon, the daemon returns that send's result, the try comes back `sent`, and the owner gets one message. When the first send never reached the daemon, the gateway answers `outcome_unknown` to every repeat, so after the third uncertain try `sendNotices` adds 1 to `keySeq` and sets `keyTries` to 0.
4. On every try, `sendNotices` adds 1 to `tries`, then sets `nextTryAt` to `now + min(5 s × 2^(tries − 1), 15 min)`, so the first retry comes 5 seconds after the first try.

The store's read `listNoticesToSend(maxTries, limit)` becomes `listNoticesDue(now, limit)`: the unsent rows whose `nextTryAt` has passed, oldest `nextTryAt` first. `noticeLimits.maxTries` and the `stuck` count of `NoticeReport` go. A migration adds `key_seq` and `key_tries`, each `INTEGER NOT NULL DEFAULT 0`, and `next_try_at INTEGER NOT NULL DEFAULT 0`. It then sets `next_try_at = at` on each row, and replaces the index of unsent rows with one on `(next_try_at) WHERE sent_at IS NULL`.

### Unsent notices in `runner.status`

The owner procedure `runner.status` ([the v1 API](./v1-api-and-auth.md)) shows the notices that wait:

```ts
notices: {
  unsent: 3,
  oldestUnsentAt: '2026-11-12T09:14:05.000Z', // null when every row is sent
  lastError: 'session_dead', // the reason of the most recent try that was not `sent`, or null
}
```

## Constraints

- The server never gives up on a notice. A row stays unsent until atc takes it, with at most 15 minutes between tries.
- The server never wakes the notice session. While the notice waits, `boxxy item list` still shows the hold. atc answers `session_dead` while the session is stopped or asleep, and `daemon_unavailable` while the owner's machine is off.
- A server restart changes no key, because each key comes from its row.
- The owner gets each notice once, with two exceptions:
  - When a first send reached the session and every repeat of its key still comes back `uncertain`, the change of key after 3 tries sends the notice a second time.
  - The atc daemon forgets a key 24 hours after its call completed. When the server stops after atc took a send but before `sendNotices` marked the row sent, and stays down for more than 24 hours, the notice goes a second time.
- A notice that is `refused` or `uncertain` changes no attempt and no item.

## What the deployment provides

- The notice token, an atc service token that holds the `message` scope alone. The worker token holds `spawn` and `kill`, so the deployment never grants it the owner's machine.
- A grant on the owner's machine that lets the notice token reach the notice session. atc lets a token reach a session only when that session and each of its sub-sessions run on a target that the grant names. The owner's agent in the notice session starts its side sessions as top-level sessions. A sub-session on another target makes atc answer `no_such_session`, and every notice then waits.
- The notice session's gateway ID in the server's configuration. When the owner replaces the session with a new one, the owner sets the new ID, and the rows that wait go to the new session on their next try.

## Decisions

- **The configuration holds the notice session's gateway ID.** atc resolves no names, and a rename keeps the ID.
- **A notice waits with no cap on tries.** A cap of 5 tries, one per tick, loses every notice sent while the owner's machine sleeps for more than 25 seconds.
- **An uncertain key gives way to a new key after 3 tries.** A rare second copy costs the owner less than a notice that never arrives.
- **The notice token is separate from the worker token.** The notice session runs on the owner's machine, and only a token without `spawn` and `kill` reaches it.
- **The server never wakes the notice session.** A wake needs `spawn` on the owner's machine, and atc cannot wake a machine that is off.

## Acceptance

- **A forced hold reaches the notice session.** On the deployed system, a throwaway item whose task tells the worker to end its attempt as `blocked`, with a question, goes on hold. Within 2 ticks, the notice session's conversation shows an `<atc-message kind="connector">` that names the item, and `atc_message_get` on that message's ID shows `delivered` or `answered`. A hold from a rules change proves nothing, because no settle writes its notice.
- **A stopped notice session loses no notice.** With the notice session stopped, a forced hold leaves `runner.status` at `unsent: 1` with `lastError: 'session_dead'`. After the owner starts the session again, the notice arrives once, within 15 minutes.
- **A rename loses no notice.** With the notice session stopped, a forced hold leaves one row unsent. The owner renames the session and starts it again, with no change to the server's configuration, and the notice arrives once, at the same session ID.
- `sendNotices` tests: a refused try changes the key; an uncertain try keeps it; the third uncertain try changes it; a refused try after an uncertain one keeps the key; a row before its `nextTryAt` is not tried; a row with 50 tries is still tried.
- Notifier tests: each atc code maps to its outcome, and the adapter sends the key it gets.

## Builder decides

- The internal names, and how the server logs a try.
- Whether a tick stops after the first `refused` outcome, since every row goes to one session.
- The test layout.

## The review tool in production

The review gate in the review-and-merge design (`review-and-merge.md`, section "The review gate") runs noslop in a review session on a worker machine, and the server posts the result as the noslop GitHub App. The deployment needs these:

- The noslop CLI in the worker image, at a pinned version. Codex, noslop's default model CLI, has no sign-in on a worker machine, so the review session runs noslop with `--adapter claude`.
- A GitHub token in the review session, as `GH_TOKEN` or `GITHUB_TOKEN`, which noslop reads to fetch the pull request.
- The App's keys in the server pod alone, and never in a worker session.
- The App, installed on every repo that the server starts workers for.
- The check: in the scratch repo of [the live proof](./v1-work-list.md#22-the-live-proof), a boxxy review round leaves a `noslop` check run, posted by the App, at the pull request's head.

## Out of scope

- Which target the notice session runs on, and the grant that reaches it. The deployment owns both.
- Asks, the requests that a worker makes to the owner for a decision. When an ask sends a notice, it uses the same rows and the same session.
