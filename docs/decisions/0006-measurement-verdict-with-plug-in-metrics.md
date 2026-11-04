# 0006: Measurement uses one verdict, with plug-in metrics and cohort keys

Date: 2026-11-04

## Decision

boxxy measures recipes and rules with the verdict pattern of noslop's eval harness, carried to live
traffic, with metrics and cohort keys as plug-ins from the start. The
[measurement design](../design/boxxy/measurement.md) defines the experiment file and the verdict.

- **Plug-ins:** a metric declares its kind (cost, time or rate) and observes one item at an analysis
  date. A cohort key reads only facts recorded before the item's exposure.
- **Fixed in the core:** assignment and the exposure fact, one estimator per metric kind, the noise
  floor, and the stop rules. An estimator becomes a plug-in on its first real need.
- **Two experiment types:** live buckets for recipes, and shadow runs for dispatch rules.
- **Required in every experiment:** a powered minimum sample, no call before the declared stop date,
  and every exposed item kept in its arm's denominator, finished or not (proposed).
- A verdict is computed, never stored. Promotion is an owner ask bound to the verdict's hash.

## Rejected alternatives

| Option                                                                                | Why not                                                                              |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| the noslop pattern with fixed cohort keys (kind, repo, size)                          | a new cohort key would change core code                                              |
| the registry design: five registries, with new metrics replayed over past experiments | five registries before the first experiment makes the first slice too large          |
| the smallest sketch                                                                   | it scored lowest, 22 points                                                          |
| live buckets for dispatch rules                                                       | pools share slots, so a challenger that takes a slot changes what the champion sees  |
| swappable noise floor and stop rules                                                  | they guard against fooling yourself, so no experiment may replace them               |
| a stored verdict                                                                      | a verdict must follow late outcomes, such as a revert at day 5 or survival at day 30 |

## Why

Three sketches were scored blind by two judges from different model families on five criteria: a
comparison you can't fool, the minimum sample known first, rules and recipes each measured
correctly, a new metric as a query, and a small first slice. The noslop pattern won narrowly, 28
against 27 for the registry design and 22 for the smallest. The hybrid keeps its small first slice
and takes the registry design's strengths: exposure facts written in the claim transaction,
Kaplan-Meier censoring for time metrics, and plug-in cohort keys. Every sketch lacked the three
required rules above, so boxxy adds them. Volume supports live buckets: 756 PRs merged in 7 days
(measured), so a 10% challenger bucket sees about 75 items a week.
