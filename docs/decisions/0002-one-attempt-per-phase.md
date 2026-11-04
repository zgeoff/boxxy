# 0002: One attempt per phase, and no permanent role sessions

Date: 2026-11-04

## Decision

Triage, design, build, review, release and QA are phases of an item, not standing roles. Each
phase runs as one attempt: one run of one phase on one item, with its own recipe, and then the
attempt stops. A retry is a new attempt. The [core model](../design/boxxy/core-model.md) defines
items, phases and attempts.

## Rejected alternatives

| Option                                                               | Why not                                                                                                                    |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| a permanent LLM session per role, such as a triage or review session | each one needs wake, restart, re-armed loops, event cursors and state files to stay alive, and its prompt goes stale       |
| one long session that carries an item through every phase            | spend, outcome and recipe can't be split by phase, and a long session would have to move when its capacity source runs low |

## Why

The question boxxy answers is what one change costs to ship, split by phase. An attempt with one
recipe and one typed close-out gives that split directly, and a recipe change becomes something an
experiment can compare. The upkeep of standing role sessions is a fixed cost: the older tool that
runs them filed about 26 to 30 maintenance issues a week on itself, flat across three weeks
(measured). Short attempts also let a router pick a capacity source at claim time, with no running
session to move.
