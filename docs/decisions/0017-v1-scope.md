# 0017: The scope of v1

Date: 2026-11-11

## Decision

v1 builds [slice 1](../design/boxxy/slice-1.md) and changes it in the ways listed below. [0014](./0014-first-slice.md) records why slice 1 comes first. The [core model](../design/boxxy/core-model.md) defines items, phases and attempts.

- boxxy dispatches four [phases](../design/boxxy/core-model.md#phases) of an item, in order: triage, design, build and review. When a review fails, boxxy starts a new build attempt on the item.
- The person who files an item, or the item's triage attempt, sets the item's design mode. In agent design, the agent writes the design and sends its [close-out](../design/boxxy/close-outs.md), and the design needs no approval. In human-in-the-loop design, boxxy starts the agent session, the owner works with the agent in that session, and the agent sends its close-out when the owner is done. The owner is the person who runs boxxy.
- boxxy reports the time of seven steps for each item. Four are the phases that boxxy dispatches. The other three are merge, release and deploy, which boxxy never starts: the tools that merge and release a repo's work today keep doing so, and boxxy reads when each one happened from [facts in pepys](../design/boxxy/slice-1.md#facts-and-the-outbox). From the attempts of the four phases, boxxy also reports rework and review wait.
- The [rules file](../design/boxxy/rules.md) caps running attempts with named limits. A limit has a maximum and a filter. The store holds a fixed set of seat rows for each limit, as many as the limit's maximum, and a running attempt holds one seat in every limit whose filter the attempt matches. [`claimNext`](../design/boxxy/dispatch.md#claimnext) takes all of an attempt's seats in one transaction, or takes none. v1 has two limits: one caps all attempts at the number of worker machines, and one caps human-in-the-loop design sessions at one. A limit never sets a seat aside for one kind of work. A [pool](../design/boxxy/planning.md#pools) keeps its filter for the items it takes and its sort for their order, and loses the slot count it has in slice 1, which the limits replace.
- The rules file sets how long a session may wait for the owner with no activity. After that time, boxxy puts the session to sleep and releases the attempt's seats. The attempt keeps its [item-phase lease](../design/boxxy/dispatch.md#leases-and-generations), so no second attempt starts on the item. When the owner returns, [`decide`](../design/boxxy/planning.md#buildframe-and-decide) picks the sleeping attempt before any new work, and the attempt takes its seats again before its session resumes. While no seat is free, the attempt stays asleep, and boxxy stops no running attempt to make room.
- The server serves its API contract, the list of its procedures, in two ways: as the oRPC API and as an MCP endpoint. Both run on oRPC v2, the version that has the MCP integration.
- v1 leaves these out: the [merge train](../design/boxxy/merge-train.md), the [router](../design/boxxy/capacity.md#models-and-the-router), the [pacing gate](../design/boxxy/capacity.md#the-pacing-gate), [experiments](../design/boxxy/measurement.md#experiments), [asks and grants](../design/boxxy/core-model.md#asks-and-grants), release and QA as dispatched phases, the [forecast](../design/boxxy/planning.md#forecast-proposed), and [explain and replay](../design/boxxy/planning.md#explain).

## Rejected alternatives

The last four rows before the router are other ways to cap running attempts.

| Option | Why not |
| --- | --- |
| slice 1 alone as v1 | slice 1 reports cost by model only, and v1 must show how long an item spends in each step |
| release and QA as dispatched phases | neither has a design, and scripts and CI run a release today, so boxxy reads the release's time instead |
| an approval step on every design | an agent's design goes straight to build, and in human-in-the-loop design the owner works in the session, which leaves nothing to approve |
| a pool with one slot for human-in-the-loop design | the slot sits empty whenever no such design waits, and the number of worker machines is fixed |
| a [gate](../design/boxxy/planning.md#concepts) that holds items when a cap is reached | planning runs a gate before the claim, so two claims at the same time can both pass the gate, and the store still needs a check of its own inside the claim's transaction |
| a shared pool for the total, where a claim takes one slot in its own pool and one in the shared pool | a pool that names no shared pool escapes the cap, and a cap that crosses pools, such as one per repo, needs new code |
| one count of held slots across all pools | it allows one shared cap only, and when the store refuses a claim, boxxy can't tell the owner whether the pool or the shared count was full |
| the router in v1 | the router's design is still proposed, and without a router each [recipe](../design/boxxy/core-model.md#attempts) names the one [capacity source](../design/boxxy/capacity.md#capacity-sources) that pays for its attempts |

## Why

The four phases are where agents spend tokens, so dispatching them lets boxxy split an item's cost and time by phase. Some designs need the owner's judgement and others don't, so the design mode is set per item. Agents call tools through MCP, so the endpoint lets an agent file and read work without the CLI.

Every run of a phase on an item is one attempt (see [0002](./0002-one-attempt-per-phase.md)), with a start and an end. boxxy therefore gets the time per phase from the attempts it already records, and needs no separate timing system. Build time is the sum of the build attempts' durations, rework is each build attempt after the first, and review wait is the gap between the end of a build attempt and the start of the review attempt. A fact in pepys records each merge, release and deploy, so boxxy measures those three steps without running them.

The number of worker machines is fixed. A limit that sets no seat aside lets any work use every machine, whereas a separate pool for human-in-the-loop design leaves one machine idle. Named limits also make the next cap a one-line change to the rules file, such as a cap per repo or per capacity source. They replace the store's slot table, and that change costs least before the store holds production data.
