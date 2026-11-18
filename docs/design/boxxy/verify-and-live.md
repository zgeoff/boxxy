# Verify and live phases

- **Status:** agreed
- **Decision records:** [0019](../../decisions/0019-credential-scope-in-server-config.md)

An item's pipeline runs `triage → design → build → review → verify → merge → live`, and each phase after build runs as its own single-purpose agent. The builder writes the journeys, and a fresh verify agent alone grades them. After the merge, a ship watch reads GitHub until the merged commit is released or deployed, and only then starts a live agent, which checks on prod the acceptance lines tagged for it. The rules file sets, per repo, what counts as shipped, and only a server-config grant gives a live agent one repo's prod credentials.

This doc uses the terms of the [core model](./core-model.md), [the pipeline](../../architecture/work/pipeline.md), [attempts](../../architecture/work/attempts.md), [agent sessions](../../architecture/work/sessions.md) and [review, verify and merge](./review-and-merge.md#terms). [Verify journeys](../../architecture/repo/verify-journeys.md) defines journeys, feature files, the path map and the `verify / gate` check, and [facts and pepys](../../architecture/interfaces/facts-and-pepys.md) covers pepys, the fact store that holds boxxy's reports.

## Shape

```mermaid
flowchart LR
  build -->|built| review
  review -->|passed| verify
  verify -->|"verified, or skipped: gate already green"| merge
  merge -->|merged| live
  watch["ship watch (server pass)"] -->|"item shipped row"| live
  live -->|"confirmed, or skipped"| done(["end"])
  live -->|"broken: files a bug item, notice"| done
```

The diagram leaves out the send-backs of review, verify and merge, which [review, verify and merge](./review-and-merge.md) owns and this design keeps.

## Contracts

### The rules file

The rules file gains a `repos` section, a list of criterion tags and four step fields. Each new word in it, such as `shipped`, `prod` or `live`, is data or a name the server registers. Modules and libs never name a phase, a tag or an environment.

```yaml
criterionTags: [prod] # the only tags an item's acceptance line may carry

repos:
  example/app: # shipped when the deploy tag holds the merge commit
    ships: { deploy-tag: { tag: deployed/prod } }
    recipes: { live: live-app-v1 } # replaces the kind's recipe for this phase, in this repo only
  example/lib: # shipped once a release holds the merge commit
    ships: { release: {} }
  example/service: # a release, then a deploy repo's bump of that release reaches its deploy tag
    ships: { release: {}, then: { repo: example/deploy, tag: deployed/prod/service } }
  example/notes:
    ships: none
  # a repo with no entry reads as `ships: none`

pipelines:
  build:
    - { phase: build, ... }
    - { phase: review, ..., on: { passed: next, ... } }
    - phase: verify
      skipWhen: [{ checkPassed: verify / gate }] # the gate already passes at the head: no feature to grade
      skip: next
      on: { verified: next, failed: { to: build, max: 2, resume: true }, blocked: { hold: blocked }, abandoned: again }
    - { phase: merge, ..., on: { merged: next, ... } }
    - phase: live
      criteria: { tagged: prod } # the session gets only these lines; with none, the step skips
      waits: [shipped] # claimable only once the ship watch records the merge commit shipped
      skip: { end: merged }
      maxAttempts: 2
      timeoutMinutes: 60
      on:
        confirmed: { end: live }
        broken: { end: live-broken, notify: true } # the close-out files a bug item
        blocked: { hold: blocked } # a line needs a write the agent lacks, or another question
        abandoned: again

kinds:
  bug:
    pipeline: build
    recipes: { build: build-bug-v1, review: review-run, verify: verify-v1, merge: merge-v1, live: live-v1 }

pools: # in claim order: an item in flight finishes before a new one starts
  - { name: merge, takes: { phase: merge } } # holds a `jobs` seat, never a `workers` one
  - { name: live, takes: { phase: live } }
  - { name: verify, takes: { phase: verify } }
  - { name: review, takes: { phase: review } }
  - { name: build, takes: { phase: build } }
  - { name: design, takes: { phase: design, designMode: agent } }
  - { name: triage, takes: { phase: triage } }

recipes:
  live-v1: { agent: boxxy, prompt: prompts/live-v1.md, ... } # no prod credentials: public endpoints only
  live-app-v1: { agent: app-live, prompt: prompts/live-v1.md, ... } # the agent whose broker profile holds example/app's prod credentials
```

A step's recipe resolves in this order, and the first match wins: the repo's `<phase>/attended`, the repo's `<phase>`, the kind's `<phase>/attended`, the kind's `<phase>`. `<phase>/attended` counts only for a design in attended mode.

### The server config

`spawn.agents` replaces `spawn.reviewAgents`. It lists each atc agent whose broker profile holds a credential, with where that agent may run.

```jsonc
{
  "spawn": {
    "agents": {
      "boxxy-review": { "phases": ["review"] }, // any repo
      "app-live": { "phases": ["live"], "repos": ["example/app"] },
    },
    "phases": {
      "review": { "requireScopedAgent": true }, // a recipe that can run review must name an agent listed for review
    },
  },
}
```

```ts
// apps/server config schema
interface AgentScope {
  phases: readonly string[]; // at least one
  repos?: readonly RepoName[]; // absent: any repo; each must be in spawn.repos
}
interface PhaseSpawnPolicy {
  requireScopedAgent?: boolean;
}
```

The rules repository's CI check loads each rules pull request as the server does, so it gets a copy of `spawn.agents` and of the repo names in `spawn.repos`.

### Criteria tags

```ts
// @boxxy/model
interface Criterion {
  // …existing fields
  readonly tags?: readonly string[]; // each one in the rules file's criterionTags
}
```

Triage, design and the owner set tags through the existing acceptance fields: `item.file`, `item.edit`, a triage close-out's `acceptance` and a design close-out's `set.acceptance`. The triage and design prompts say when to tag a line `prod`: when only the deployed system can prove it.

### Step gates and the skip

```ts
// @boxxy/rules: step fields
interface StepGates {
  criteria?: { tagged: string }; // filters the phase input and the launch prompt; no match skips
  skipWhen?: readonly SkipCondition[]; // any one true skips
  waits?: readonly string[]; // wait kinds the server registers; the claim passes over the step until each holds
  skip?: SkipEdge; // required when any of the three is set
}
type SkipCondition = { checkPassed: string }; // the latest run of the named check at the pull request's head passed
type SkipEdge = 'next' | { end: string } | { hold: string }; // never `again`, never `{ to }`

// @boxxy/model
type EngineOutcome = 'lost' | 'unsettleable' | 'skipped'; // `skipped` takes the step's `skip` edge

// @boxxy/model: the server registers each wait kind, as it registers phase kinds
interface WaitKind {
  name: string; // 'shipped'
  after: { outcome: string }; // the loader refuses the wait unless an earlier step's phase kind has this outcome ('merged')
  read(item: WaitSubject, repo: RepoPolicy): 'holds' | 'waiting' | 'skip'; // pure
}
interface WaitSubject {
  item: Item;
  mergeCommit: CommitSha | null; // of the latest merged pull request, by mergedAt, among those linked to the item's succeeded builds
  shipped: readonly ItemShipped[];
}
interface RepoPolicy {
  ships: ShipRule; // 'none' when the repo has no `repos` entry
  recipes: Readonly<Record<string, string>>;
}

// @boxxy/model: a third Claim kind; claimNext returns the skips it recorded beside its pick
type Claim = /* …existing kinds */ { kind: 'skipped'; itemId: ItemId; phase: string; reason: SkipReason };
type SkipReason = `no-criteria-tagged:${string}` | `check-passed:${string}` | `wait-skip:${string}`;
```

```ts
// fact payloads; both join the pepys wire schemas
type AttemptSkipped = { attemptId: AttemptId; itemId: ItemId; phase: string; round: number; reason: SkipReason }; // boxxy.attempt.skipped
type ItemShippedFact = ItemShipped; // boxxy.item.shipped
```

### The ship watch

```ts
// server pass, on a fixed interval, only with a `github` section in the server config
const shipped = await watchShips({ forge, store, rules, now });
// → [{ itemId: 'it_42', commit: '9f3c…', rule: 'deploy-tag', ref: 'deployed/prod', seenAt: '2026-11-19T08:10:00Z' }]

// @boxxy/model
type ShipRule =
  | 'none'
  | { 'deploy-tag': { tag: string } }
  | { release: { prerelease?: boolean }; then?: { repo: RepoName; tag: string } };

interface ItemShipped {
  itemId: ItemId;
  commit: CommitSha; // the merge commit of the item's latest merged pull request
  rule: 'deploy-tag' | 'release' | 'release-then-deploy'; // the last for `release` with `then`
  ref: string; // the deploy tag, or the release tag for `release`
  release?: string; // for `release-then-deploy`: the release tag the bump names
  seenAt: string; // when the watch saw it, not when it shipped
}

// the forge port gains these (the GitHub adapter, and the fake forge for tests)
interface Forge {
  // …existing methods
  contains(repo: RepoName, ref: string, commit: CommitSha): Promise<boolean>; // ancestry, by the commit compare
  readRepo(repo: RepoName): Promise<'readable' | 'not-found'>; // not-found: missing, or the App can't read it
  readTag(repo: RepoName, tag: string): Promise<CommitSha | null>; // null: no such tag; call after readRepo
  listReleases(repo: RepoName): Promise<readonly Release[]>; // published, newest first, at most 100
  findBumps(repo: RepoName, since: string): Promise<readonly MergedPullRequest[]>; // bot-authored, merged at or after `since`
}

interface Release {
  tag: string;
  url: string; // https://github.com/<owner>/<name>/releases/tag/<tag>
  draft: boolean;
  prerelease: boolean;
  publishedAt: string;
}
interface MergedPullRequest {
  number: number;
  body: string;
  mergeCommit: CommitSha;
  mergedAt: string;
}
```

The watch writes the `item_shipped` row, keyed by item and commit, and the fact `boxxy.item.shipped`, in one store change.

### The live phase

```ts
// @boxxy/closeout: the live phase kind's input and close-out
interface LiveInput {
  pullRequest: PullRequestRef;
  commit: CommitSha;
  shipped: ItemShipped;
  criteria: readonly Criterion[]; // only the lines the step's `criteria.tagged` matches
}

type LiveCloseOut =
  | { outcome: 'confirmed'; lines: readonly LineResult[] }
  | { outcome: 'broken'; lines: readonly LineResult[]; bug: LiveBug }
  | { outcome: 'blocked'; reason: string } // the question for the owner
  | { outcome: 'abandoned'; reason: string };

// filed through the openItems effect, with a `relates-to` link to the checked item
interface LiveBug extends OpenItem {
  kind: 'bug'; // the parser refuses another kind
  acceptance: readonly { text: string; tags: readonly string[] }[]; // the failing lines, tags kept; OpenItem gains this field
}

interface LineResult {
  criterionId: CriterionId;
  passed: boolean;
  evidence: string; // stays in the item: never posted to the pull request
}
```

### Spawn

```ts
// @boxxy/worker-atc: the stored spawn request gains the repo and the phase
interface SpawnRequest {
  // …existing fields
  repo: RepoName;
  phase: string;
}
```

## Constraints

### Who holds a credential

- The rules loader refuses a rules file when a recipe that can run a step names an agent in `spawn.agents` outside that agent's phases or repos (`agent-outside-scope`). It resolves every repo in `spawn.repos` against every kind and step, to find each recipe that can run each step.
- The loader refuses a phase with `requireScopedAgent` when a recipe that can run it names an agent that `spawn.agents` doesn't list for that phase (`phase-without-scoped-agent`).
- The loader refuses a scoped agent's recipe with `session: builder`, and a `resume: true` edge into a phase that a scoped agent runs, so a kept session never carries a credential into another phase.
- The operator keeps every credential in the broker profile of an agent that `spawn.agents` lists, because boxxy can't read a broker profile. An agent missing from `spawn.agents` runs any phase in any repo.
- The atc worker refuses a spawn or a respawn whose agent is listed in `spawn.agents` without the request's repo or phase, with `agent not scoped`. A config change between the claim and a respawn therefore can't move a credential.
- The worker reads a stored request that has no `repo` or `phase` with the attempt's repo and phase.
- The server refuses to start with `spawn.reviewAgents` in its config, with a message that gives the `spawn.agents` shape.

### The ship watch

- The watch reads each item that is not held, whose repo is in `spawn.repos`, whose position is a step that waits on `shipped`, and that has no shipped row for its `mergeCommit`. A paused runner pauses claims only, so the watch still runs. The watch writes nothing while `mergeCommit` is null.
- The ship rule is always the item's own repo's.
- `deploy-tag`: the item ships when the tag's commit contains the merge commit.
- `release`: the watch reads releases newest first, skips drafts and, unless `prerelease: true`, prereleases, and stops at the first release that doesn't contain the merge commit. R is the oldest release it read that contains it. With none, the item waits. The item ships with `ref` set to R's tag.
- `release` with `then`: once R exists, the watch calls `findBumps(then.repo, R.publishedAt)`. A bump counts when its body holds, as a whole URL, R's URL or the URL of a release published after R. The item ships when `then.tag`'s commit contains a counted bump's merge commit, with `ref` set to `then.tag`. A bump is a pull request whose author GitHub gives the user type `Bot`, the rule pepys's GitHub plug-in uses.
- A shipped row satisfies the wait only for the merge commit it names. After `boxxy item retry <item> --phase build` and a second merge, the watch reads the new commit.
- A shipped row for the item's `mergeCommit` makes the wait hold, whatever the repo's ship rule says now. A rules change never removes or rewrites a shipped row.
- The watch calls `readRepo` on each repo it reads before any other call there. On `not-found`, it logs that the App can't read the repo, and the item waits.
- A forge call that throws writes nothing, and the next pass reads again.
- The boxxy App needs read access to `contents` on every repo that a `ships` rule names, the deploy repo of a `then` included.
- The loader refuses a `shipped` wait on a server with no `github` section, as it refuses a merge step there.
- When a step waits on `shipped`, the loader warns about each repo in `spawn.repos` with no `repos` entry, because those items skip the step.
- A webhook never changes boxxy state. Only the watch writes `item_shipped`.

### Gates and skips

- The claim checks a step's gates in this order: `criteria`, then `skipWhen`, then each wait. The first one that says skip settles the step as skipped. A wait that says `waiting` leaves the item where it is.
- The caller of `deriveItemState` runs each wait of the item's step and passes the answers in, so the state code stays pure and names no wait. An item whose wait says `waiting` derives as waiting, with the reason `wait:<kind>`. A wait that says `holds` or `skip` leaves it `ready`, so the claim sees it.
- `claimNext` records every skip before `decide` runs, and returns the skips beside its pick. One call can skip an item through several steps in a row, such as a skipped verify followed by a later step that also skips. A skip needs no pool, no seat and no lease, and writes no decision row. A paused runner records no skip, and neither does a claim for a repo missing from `spawn.repos`.
- The claim records a skip as one attempt row, in the state `succeeded`, with the worker `skip`, no session, no pool, no spawn request, the engine outcome `skipped` and the skip reason, and one fact, `boxxy.attempt.skipped`. The runner's session reads, stops and forgets all pass over that row, because it has no session. pepys leaves skipped attempts out of each stage's time.
- A skip counts toward no `maxAttempts` and no edge `max`.
- The item's replay reads a skip like any settled attempt. A tag added to an item's line after its step skipped therefore doesn't bring the step back: `boxxy item retry <item> --phase <phase>` does.
- The `shipped` wait says `skip` when the item's repo ships `none`. When that item has a line with the step's `criteria.tagged` tag, the skip also writes a notice, because no live check will prove that line.
- That notice and the notice of a `notify: true` edge are one notice kind: the item, the phase and the reason, sent to the owner's notice session as a hold notice is.
- Build order: whichever pull request builds the first of the three gates also builds what they share, which is the gate order, the `skip` edge, the `skipped` outcome and the parse of `repos`.
- `criteria.tagged` filters both the phase input and the launch prompt's acceptance lines.
- `item.file`, `item.edit` and every close-out that sets acceptance refuse a tag that `criterionTags` doesn't list.
- The loader refuses a step that sets `criteria`, `skipWhen` or `waits` with no `skip` edge, an unknown wait kind or condition, a `criteria.tagged` tag missing from `criterionTags`, and a wait whose `after` outcome no earlier step's phase kind has.

### Verify

- The build phase writes or changes the journey, the feature file and the path map for each feature it adds or changes, and runs `bun verify lint`. It records no verdict and publishes no report.
- Only the verify phase records verdicts and runs `bun verify publish`.
- The build and rework launch prompts say that `verify / gate` stays red until the verify phase runs, and that the builder leaves it.
- The verify step skips when the latest `verify / gate` check run at the head passed. The gate passes only when every changed feature has a fresh verdict, so a skip never merges an ungraded change.
- The wringer verifier, which the merge job calls ([what the merge step reads](../../architecture/repo/verify-journeys.md#what-the-merge-step-reads)), reads a passed gate whose pull request body holds no report as `verified` with no features. A skipped verify publishes no report. Without this rule the verifier reads `incomplete`, the merge job settles `unverified`, and the item goes back to a verify step that skips again.

### Live

- The live agent runs `bun verify doctor --target prod`, then checks each line it got against the repo's prod target, read-only.
- When a line needs a write that the repo's QA guards don't allow ([what a repo gives its live agent](#what-a-repo-gives-its-live-agent)), the agent closes out `blocked` with the write it needs.
- A `broken` close-out files its bug through the existing `openItems` effect, with the failing lines and their tags, so the bug's own live step checks them again.
- `notify: true` on an edge writes a notice at settle without a hold.
- Live evidence goes into the item and the close-out, never into a pull request: the repos are public, and prod data is not.

### What a repo gives its live agent

- A prod target in its verify registry, with `access: 'read-only'` and `evidence: 'local'`.
- Any QA kit that writes to prod confines each write to a QA area and refuses outside it, as a guard in the repo's own scripts.
- Its prod credentials in its own vault, read by the broker profile of its scoped agent.

## Decisions

- **Throughput keeps the shared `workers` limit of 7 agent sessions.** Verify and live add no limit of their own, and the pool order runs later phases first. Until the claim reads the worker target's free compute, the `workers` limit stands in for it.
- **The ship watch reads GitHub through the forge adapter, never pepys.** boxxy reads pepys only for reports, and that reader never retries. pepys also records no deploy for a repo that deploys its own code with no bump pull request.
- **Each repo's ship rule is data.** A deploy tag, a release, or a release then a deploy repo's tag cover the repos with no new workflow in any of them.
- **A failed live check ends the item and files a bug.** The item's pull request has already merged, so a fix needs a new pull request, and a new item keeps each item's cost and land time true in pepys.
- **The credential grant lives in the server config, and the agent choice in the rules file.** [0019](../../decisions/0019-credential-scope-in-server-config.md)

## Builder decides

- The interval of the ship watch, and its cap on items per pass.
- The names of the rejection kinds beyond those named here, and their messages.
- The live prompt's wording, and the triage and design prompt lines that set the `prod` tag.
- The store table and migration for `item_shipped`, and the columns of a skipped attempt row beyond those named here.
- How `findBumps` pages a deploy repo's merged pull requests, and its page cap.

## Out of scope

- Claims that follow the worker target's free compute. A separate work item builds that, with limits as optional lane caps.
- A per-item credential. Each scoped agent covers one repo and its listed phases.
- pepys reading `boxxy.item.shipped`. Its stage times keep reading GitHub's own release and deploy times.

## Open questions

- **How long an item waits to ship.** The owner settles it. Until then the wait has no limit.
