# 0007: Spend capture goes through OpenTelemetry

Date: 2026-11-04 Updated: 2026-11-05

## Decision

boxxy captures token spend from the agents' OpenTelemetry (OTel) output, going forward. A one-off,
usage-fields-only read of past session logs gave a baseline before boxxy existed. The
[measurement design](../design/boxxy/measurement.md) lists each capture source.

- Claude Code and Codex send OTel logs to a local OTLP receiver. Claude Code's `api_request` event
  carries per-request tokens and cost. Prompt and response text stay redacted.
- atc's own agent config switches telemetry on per agent. boxxy adds nothing to the spawn request.
- boxxy joins each request record to its attempt by the agent session id (proposed). Claude Code
  puts `session.id` on each record, atc records it as `agentSessionID`, and boxxy stores it on the
  attempt. The attempt row gives the item, phase, recipe and capacity source. Whether Codex
  telemetry carries a session id that boxxy can join on is open.
- Hooks or a mod carry work events, such as tool use, subagents and compaction, joined to OTel on
  `session_id`.
- A spend query counts total input as `input_tokens` plus cache read and cache creation tokens.

## Rejected alternatives

| Option                               | Why not                                                                                            |
| ------------------------------------ | -------------------------------------------------------------------------------------------------- |
| OTel only                            | it answers nothing about the weeks before capture started                                          |
| the past-log read only               | it answers nothing going forward, and it is not boxxy's capture path                               |
| token usage from hooks               | no hook payload carries token usage                                                                |
| transcripts as the main source       | boxxy captures structured data first; transcripts are a fallback                                   |
| attempt attributes set on each spawn | atc's `session.spawn` would need a telemetry field, and the session id joins each record with none |

## Why

Where token spend goes is the first question boxxy must answer. Doing both gave an answer for the
past weeks at once and started the real capture path before any boxxy code existed. The local
receiver has run since 2026-11-04, and a test run showed per-request token counts from both agents
(measured). `input_tokens` excludes the cache, so a query that sums it alone undercounts input.
