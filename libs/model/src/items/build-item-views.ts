import { findPosition } from '../pipeline/find-position.ts';
import { findStep } from '../pipeline/find-step.ts';
import type { Position } from '../pipeline/types.ts';
import type { ItemRules, PipelineStep } from '../rules/types.ts';
import type {
  AttemptId,
  AttemptRow,
  DerivedState,
  Instant,
  ItemId,
  ItemRow,
  ItemShipped,
  ItemState,
  LeaseRow,
  LeverRow,
  PullRequestRow,
  RelationRow,
} from '../types.ts';
import { collectRetries } from './collect-retries.ts';
import { collectSettled } from './collect-settled.ts';
import { collectWaitAnswers } from './collect-wait-answers.ts';
import { deriveItemState } from './derive-item-state.ts';
import { findHeldReason } from './find-held-reason.ts';
import { liveLevers } from './live-levers.ts';
import type { ItemSetRows, ItemWithLevers } from './types.ts';

export function buildItemViews(
  rows: ItemSetRows,
  now: Instant,
  rules: ItemRules,
): ItemWithLevers[] {
  const groups = collectItemGroups(rows, rules, now);

  // A blocking source counts only when it is done or archived, and no relation makes an item either,
  // so each source's state derived without its relations settles its targets.
  const ownStates = new Map<ItemId, ItemState>(
    groups.map((group) => [
      group.item.id,
      deriveGroupState(group, rules, { relations: [], blockerStates: new Map() }).state,
    ]),
  );

  return groups.map((group) =>
    buildItemWithLevers(
      group,
      deriveGroupState(group, rules, { relations: group.relations, blockerStates: ownStates }),
      now,
    ),
  );
}

interface ItemGroup {
  readonly item: ItemRow;
  readonly relations: RelationRow[];
  readonly attempts: AttemptRow[];
  readonly pullRequests: PullRequestRow[];
  readonly shipped: ItemShipped[];
  readonly levers: LeverRow[];
  liveLease: LeaseRow | null;
  position: Position;
}

// in the order of `rows.items`
function collectItemGroups(rows: ItemSetRows, rules: ItemRules, now: Instant): ItemGroup[] {
  const groups = new Map<ItemId, ItemGroup>(
    rows.items.map((item) => [
      item.id,
      {
        item,
        relations: [],
        attempts: [],
        pullRequests: [],
        shipped: [],
        levers: [],
        liveLease: null,
        position: { kind: 'end', reason: 'no-pipeline' },
      },
    ]),
  );

  const attemptItems = new Map<AttemptId, ItemId>();

  for (const relation of rows.relations) {
    groups.get(relation.target)?.relations.push(relation);
  }

  for (const attempt of rows.attempts) {
    attemptItems.set(attempt.id, attempt.item);
    groups.get(attempt.item)?.attempts.push(attempt);
  }

  for (const pullRequest of rows.pullRequests) {
    const item = attemptItems.get(pullRequest.attempt);

    if (item !== undefined) {
      groups.get(item)?.pullRequests.push(pullRequest);
    }
  }

  for (const row of rows.shipped) {
    groups.get(row.itemId)?.shipped.push(row);
  }

  for (const lever of rows.levers) {
    groups.get(lever.item)?.levers.push(lever);
  }

  for (const lease of rows.liveLeases) {
    const group = groups.get(lease.item);

    if (group !== undefined) {
      group.liveLease = lease;
    }
  }

  for (const group of groups.values()) {
    group.position = findPosition({
      pipeline: rules.kinds.get(group.item.kind)?.pipeline ?? null,
      attempts: collectSettled(group.attempts),
      retries: collectRetries(group.levers),
      now,
    });
  }

  return [...groups.values()];
}

interface Blocking {
  // the live relations whose target is the item
  readonly relations: readonly RelationRow[];
  readonly blockerStates: ReadonlyMap<ItemId, ItemState>;
}

function deriveGroupState(group: ItemGroup, rules: ItemRules, blocking: Blocking): DerivedState {
  return deriveItemState({
    ...blocking,
    item: group.item,
    position: group.position,
    heldReason: findHeldReason(group.levers),
    liveLease: group.liveLease,
    phases: rules.phases,
    attempts: group.attempts,
    pullRequests: group.pullRequests,
    waitAnswers: collectWaitAnswers({
      step: findGroupStep(group, rules),
      item: group.item,
      attempts: group.attempts,
      pullRequests: group.pullRequests,
      shipped: group.shipped,
      rules,
    }),
  });
}

function findGroupStep(group: ItemGroup, rules: ItemRules): PipelineStep | undefined {
  const pipeline = rules.kinds.get(group.item.kind)?.pipeline;

  return group.position.kind === 'phase' && pipeline !== undefined
    ? findStep(pipeline, group.position.phase)
    : undefined;
}

function buildItemWithLevers(
  group: ItemGroup,
  derived: DerivedState,
  now: Instant,
): ItemWithLevers {
  return {
    ...group.item,
    derived,
    position: group.position,
    levers: liveLevers(group.levers, now),
  };
}
