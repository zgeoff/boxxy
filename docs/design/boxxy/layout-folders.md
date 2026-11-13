# Folder layout

This doc sets the folders inside each package that [v1](./v1.md) adds or grows. Put a new module in the folder this doc names. In a package that holds code, a line marked `v1:` names a module that v1 adds. Every module of `modules/dispatch/src` outside `test-utils/`, the `dry-run/` folder of `modules/rules/src` and every package under "New packages" is new. The package split itself is in [layout](./layout.md).

## The rules the layout follows

Three lint rules of `@zgeoff/oxlint-config` shape a package's `src/`:

- `zgeoff/feature-folders`: the root of `src/` holds 8 loose modules at most. The count leaves out `index.ts`, `types.ts`, `constants.ts`, tests, and each file that `package.json` names as an entry. A subfolder has no limit. `test-utils/` and `generated/` are not feature folders.
- `zgeoff/feature-folders`: shared code lives in `src/utils/`, and a file in `utils/` imports no feature folder, type imports included.
- `zgeoff/file-named-for-export`: one export of each file has the file's name. `index.ts`, `types.ts` and `constants.ts` are exempt, in any folder.

So each package groups its modules by subject. A folder's types live in its own `types.ts`. A test sits beside its module. No package's `index.ts` changes its export names.

## `libs/model/src`

```text
index.ts          the public API: re-exports only
types.ts          the shared vocabulary: IDs, stored rows, item state, recipes
rows/             the zod schema of each ID and each stored row, one file per row
                  brand-schemas  actor-ref-schema  criterion-schema  caller-identity-schema
                  item-row-schema  attempt-row-schema  attempt-session-row-schema
                  lever-row-schema  relation-row-schema  decision-row-schema
                  pull-request-row-schema  note-row-schema  notice-row-schema
                  limit-seat-row-schema  limit-schema  lease-row-schema  runner-row-schema
                  row-schemas (every stored row's schema, by table)
items/            what an item's rows derive to: its position, its state and its live levers
                  types  build-item-views  derive-item-state  live-levers
planning/         the planning types and the definers of its plug-ins
                  types  define-signal  define-gate  define-admission  signal-key
rules/            the loaded rules, the plug-in registries, pipelines and phases
                  types  define-phase
pipeline/         the engine that moves an item through its pipeline
                  types (Settled, Position, RetryLever)  advance  find-position
                  find-step  count-trailing  merge-by-time
                  constants (the engine's outcomes and hold reasons)
dispatch/         claims, settlement and the parts of a store change
                  types  build-applied-change  pick-seat-take  collect-seat-sync
closeouts/        the close-out types and schemas
                  types  close-out-schema  triage-close-out-schema  design-close-out-schema
                  build-close-out-schema  review-close-out-schema  stored-review-close-out-schema
                  verify-close-out-schema  verify-input-schema  merge-close-out-schema
                  friction-schema  open-item-schema
facts/            the fact catalog and the outbox row
                  types  work-fact-schemas  outbox-fact-schema  parse-new-fact
merge/            types: what the merge job reads and what a merge decides
ports/            the interfaces that an adapter implements
                  types: the store, the workers, the notifier, the pepys reader, the forge,
                  the review gate, the verifier
reports/          the output schemas of the pepys queries
                  cost-to-land-schema  stage-time-schema  types  constants (the step and basis lists)
                  outbox-status (the `runner.status` outbox type)
utils/            format-key-path  to-json-value
test-utils/       the factories    v1: create-fake-pepys-reader  pepys-reader-contract
                  build-mock-work-fact  build-mock-cost-to-land  create-fake-notifier
                  build-mock-phase-kind  build-mock-outbox-fact
                  fact-sink-contract (here, so `@boxxy/pepys` runs it with no module)
```

## `adapters/store-sqlite/src`

```text
index.ts  types.ts
create-sqlite-claim-store      opens the file and builds the store
with-transaction  with-busy-retry
migrations/       run-store-migrations  create-tables-migration  v1-tables-migration
                  one file per later migration
codecs/           how a row maps to its columns
                  table-codecs  parse-store-row  parse-json-text  to-store-columns  to-column-name
reads/            build-sqlite-reader  read-item-views  read-limit-fills  read-wakes
                  is-latest-of-session
writes/           create-sqlite-tx  apply-sqlite-change  take-write-lock
test-utils/       create-test-claim-store  seed-v1-review-close-out
```

## `modules/dispatch/src`

v1 adds more than 8 modules to this package, so they start in folders:

```text
index.ts
timeouts  types  every time limit of dispatch that the rules do not hold
attempts/         the attempt lifecycle and its one writer
                  attempt-moves  attempt-machine  build-attempt-change  build-attempt-fact
                  build-event-columns  get-action-member  end-item-attempts  is-same-guard
                  pick-call-attempt  write-attempt-move  write-session-bind  types
claims/           claim-next  start-claim  resume-claim  request-wake  pick-kept-session
                  find-recipe-name  build-snapshot-hash  types
readings/         what the runner does with a session reading
                  pick-reading-action  find-waiting-since  find-closing-failure  act-on-reading
                  types
jobs/             what the runner does with each read of a job attempt
                  run-job-reading  types
closeouts/        close-out-attempt  read-close-out-context  settle-attempt  pick-settlement
                  build-settle-plans  effect-handlers  types
sessions/         resume-kept-session  forget-sessions  build-keep-writes  is-builder-session
pull-requests/    link-pull-request  watch-pull-requests  build-link-change  build-state-fact
                  collect-attempt-trailers  collect-seen-state  parse-pull-request-url
                  constants  types
notices/          create-null-notifier  send-notices
outbox/           what the outbox sender decides, with no I/O
                  take-batch  constants (the outbox limits)  measure-wire-bytes  pick-sender-move
                  run-sender-once  build-backoff-ms  build-initial-sender-state
                  build-outbox-status  types
test-utils/       the store contract and its case files, the memory store, the change factories
                  v1: create-fake-worker  worker-contract  create-fake-clock
                  create-fake-backoff  create-test-dispatch  create-fake-fact-sink  create-fake-forge
                  forge-contract  create-fake-job  load-job-rules  load-verify-rules
```

A new case file of the store contract goes in `test-utils/`, beside `claim-store-contract`.

The attempt state machine is `attempts/attempt-machine`, with its test beside it. It is an XState machine built from the table of moves in `attempts/attempt-moves`, and `build-attempt-change` in the same folder is its only caller. `@boxxy/dispatch` has one dependency for it, `xstate`, pinned exactly at `6.0.0-beta.2` with no version range. No other package imports `xstate`.

`build-attempt-change` is the only file of the package that writes the attempts table, the attempt sessions table or a limit seat. The store's `syncLimits` also writes seats, outside any store change, when the loaded limits change which attempts they count. The test of `scripts/collect-attempt-writes` reads the package's source and fails on such a write in any other file. It leaves out the tests and the store fixtures in `test-utils/`, which seed those tables.

## `modules/planning/src`, `modules/closeout/src`, `modules/rules/src`

```text
modules/planning/src
  build-frame  decide  propagate  concepts  compare-item-ids  format-fault
  concepts/       one file per concept; the file exports the concept under its own name
                  pool (exports `pool`)  defer  expedite
  generated/      concept-pins

modules/closeout/src
  phase-kinds  build-schema-parser  close-out-limits  measure-json-bytes
  dedupe-open-items  missing-criteria  normalise-title
  phases/         one file per phase kind, named as a concept file is: build (exports `build`),
                  verify (exports `verify`);
                  create-review-phase builds the review phase kind on the gate's `buildCommand`
  review/         build-round-cause  count-unrelated-lines
  utils/          the input helpers that two phase kinds share

modules/rules/src
  index  types  constants
  loading/        load-rules  build-rejection  to-filter
                  collect-step-rejections  collect-recipe-rejections  collect-filter-rejections
  parse/          parse-rules-file  parse-concept-entry  rules-file-schema
  registry/       build-registry  resolve-plugin  resolve-signal-ref
  dry-run/        v1: dry-run-rules
  test-utils/     load-mock-rules  build-example-load-input
modules/rules/example           the v1 rules file and its prompts, which a loader test reads
```

`modules/planning` keeps 6 loose modules: v1 adds no `explain`, because the contract has no procedure that explains a decision. `modules/rules` keeps its modules in the folders above, and only `index`, `types` and `constants` stay loose in `src/`, so the rules dry run is one more folder.

## New packages

```text
libs/contract/src               @boxxy/contract
  index  contract  access       the oRPC contract, and who may call each procedure

apps/server/src                 @boxxy/server
  main                          the process entry: starts the server, stops it on a signal
  start-server                  reads the configuration, builds the adapters, starts it all
  serve-api                     one router behind four doors on the owner, worker and public listeners
  read-limited-request          the body cap, counted while the body streams in
  serve-public-door             the public door's listener: forwards each request to the door
  no-caller-proof               the `CallerProof` adapter that proves nobody
  create-capacity-backoff       the runner's memory of the pools a host refused for capacity
  auth/           pick-request-scope  authorize-call  pick-tool-scope (the scope of each owner tool)
  config/         server-config-schema  read-server-config  pick-server-secrets
                  read-trusted-issuers  read-caller-proof (the one place that builds the
                  identity adapter)
  rules/          read-rules-checkout  load-server-rules  create-rules-holder
                  build-server-registrations (the phase kinds and worker names the rules load with)
  handlers/       one file per procedure group, named `<group>-handlers`, with `api`
                  and the helpers they share
  tick/           run-tick  start-tick-loop
  outbox/         start-outbox-sender  create-off-outbox
  test-utils/     create-test-server  create-fake-caller-proof  and the request builders

apps/cli/src                    @boxxy/cli
  index  main  types  constants  create-client  run-git
  cli/            run-cli  pick-command  parse-command-args  format-help  usage-error
                  build-answer-result  make-answer-run
  commands/       one file per procedure group, such as attempt-commands, with all-commands
                  and the helpers they share
  hooks/          run-session-start-hook  run-post-tool-use-hook  install-skills
                  parse-hook-payload  pick-pull-request-url  wait-for-attempt
  test-utils/     create-skills-repo  build-mock-cli-deps
system-tests/src                @boxxy/system-tests: the CLI against the real server
  test-utils/     create-test-cli  make-broker-send  read-json-output
                  verify/  the verify CLI, its registry and its harness: wringer-journeys.md
system-tests/e2e                one cli-<group>.system.test.ts file per command group and per hook,
                                start-server-atc-spawn: the server's spawn through the atc stand-in,
                                and start-server-atc-notice: a hold notice through the atc stand-in
apps/cli/hook-plugin            the Claude Code plug-in that the agent image installs

adapters/notifier-atc/src       @boxxy/notifier-atc
  index  create-atc-notifier    sends a hold notice as an atc message to one session, by its ID

adapters/review-noslop/src      @boxxy/review-noslop
  index  types  create-noslop-review-gate  build-review-command  parse-review-body
  build-gate-reading  build-gate-cost
  test-utils/     build-mock-review-result  create-fake-noslop-client  create-stub-noslop

adapters/verifier-wringer/src   @boxxy/verifier-wringer
  index  types  create-wringer-verifier
  test-utils/     build-mock-wringer-report

adapters/forge-github/src       @boxxy/forge-github
  index  types  constants  create-github-forge  create-github-client  github-schemas
  to-pull-path  to-pull-request-reading  read-pull-request-body  read-checks
  collect-check-states  github-forge-error
  test-utils/     create-fake-github-fetch  github-handlers: the MSW handlers on @msw/data
                  mock-network  reset-mock-network: the mock network that the test preload starts

adapters/auth-oauth/src          @boxxy/auth-oauth: the public door's OAuth server, copied from atc
  index                         create-public-door and the types the server reads
  auth/           the OAuth server on better-auth, the passkey sign-in, enrollment, consent and
                  the security events, and `create-auth-admin` for the owner's commands
  http/           create-public-door  create-mcp-http-app  public-door-paths  answer-mcp-request
                  and the Host, origin and bearer checks
  utils/          is-record  parse-json-strings  types
  test-utils/     authorize-test-client  build-stub-authenticator  build-stub-clock  seed-passkey

adapters/caller-proof-imp/src   @boxxy/caller-proof-imp
  index  types  imp-identity-caller-proof
  test-utils/     create-test-issuer

adapters/worker-atc/src         @boxxy/worker-atc
  index  types  create-atc-worker  to-session-reading  find-caller-identity  is-folder-trusted
  is-capacity-refusal
  mcp/            create-atc-mcp-client  atc-tool-results  parse-tool-result  atc-call-error
                  to-capped-response
  test-utils/     create-fake-atc  create-fake-atc-server  build-mock-atc-session-read

packages/pepys/src              @boxxy/pepys
  index  build-boxxy-plugin     the `.` entry: the plug-in, given the GitHub and telemetry consumers
  create-pepys-fact-sink  create-pepys-reader   the `./sink` and `./reader` entries
  boxxy-source    the fact family and the source
  wire-fact-schemas   the model's fact schemas plus the store version: the family's types
  boxxy-work-plugin   the source and the consumer alone, from which `pepys build` writes the glue
  types           the typed client of the two queries
  sink/           to-wire-fact  pick-sink-answer  is-outgoing-fact
  work/           boxxy-work-consumer  constants (the link types)  fold-work-facts  types
  consumers/      apply-scope: the scriptc entry file of `boxxy_work`
  generated/      the glue that `pepys build` writes; never edited by hand
  queries/        build-cost-to-land-query  build-stage-time-query  build-cost-to-land
                  build-stage-time  find-item-entity-id  constants  types
  test-utils/     create-real-pepys  create-test-pepys  create-ingest-stand-in
                  create-query-stand-in  build-foreign-stand-in
                  build-mock-applied-fact  build-mock-scope-fact  build-mock-item-facts
                  to-scope-fact  to-entity-id  and the read-row factories
```

The pepys package sits at `packages/pepys`, so the workspace has a `packages/*` glob.

The `Notifier` port is in `libs/model/src/ports/`, and its fake is in `libs/model/src/test-utils/`. v1 has no worker adapter for the review tool: the review is a session with a recipe, on the atc worker. In [review, verify and merge](./review-and-merge.md), the review stays a session on the atc worker, and the server checks and posts its result through the `ReviewGate` port.

A name in the trees above differs from the v1 sketches where a lint rule needs it:

- A file's name is its main export: a sketch's `handlers/item.ts` is `handlers/item-handlers.ts`, and `run-outbox-sender.ts` and `report-schemas.ts` each split into one file per export.
- The sender's decisions live in `modules/dispatch/src/outbox/`, and the app owns the timer only. `run-sender-once` does no I/O of its own: it takes the store's outbox port, the `FactSink` port, the clock and a random source as arguments, and it does one turn. `start-outbox-sender` in `apps/server/outbox/` builds those arguments, calls the turn, waits for `nextTryAt` or a nudge between turns, and holds the sender state.
- A test sits beside its module: a sketch's `outbox.test.ts` is `outbox/take-batch.test.ts`.

## Open questions

Each of these is a guess that the v1 build confirms or changes:

1. `libs/model/src/types.ts` holds the old `types/core.ts` whole. A split by subject, such as IDs, rows and recipes, is a later choice.
2. `ports/` and `rows/` name a kind of file more than a subject. The alternative is to split `ports/types.ts` by port into the subject folders.
3. A concept file exports under the bare name, such as `pool`, as a phase file does (`review`). The other fix is a file name with a suffix, such as `pool-concept.ts`, which breaks the pin script's `concepts/<name>.ts` path.
