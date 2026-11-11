import type {
  AttemptRow,
  EngineOutcome,
  Instant,
  ItemView,
  LoadedRules,
  OutcomeName,
  StoreChange,
  StoreTx,
} from '@boxxy/model';
import invariant from 'tiny-invariant';
import { buildAttemptChange } from '../attempts/build-attempt-change.ts';
import { isSameGuard } from '../attempts/is-same-guard.ts';
import type { MoveResult } from '../attempts/types.ts';
import { buildKeepWrites } from '../sessions/build-keep-writes.ts';
import { buildSettlePlans } from './build-settle-plans.ts';
import { pickSettlement } from './pick-settlement.ts';
import type { SettleAttemptInput } from './types.ts';

// Settles one attempt, with the writes of its effects, in one change and one lock. No step
// throws on stored data, so only a store error leaves it. When the item holds after the settle,
// the same lock writes the notice row. A settle decided on an older row refuses, with no write.
export function settleAttempt(input: SettleAttemptInput): Promise<MoveResult> {
  return input.store.exclusive(async (tx) => {
    const attempt = await tx.readAttempt(input.attempt);

    invariant(attempt !== null, `the settle names a stored attempt: ${input.attempt}`);

    if (input.seen !== undefined && !isSameGuard(input.seen, attempt)) {
      return { kind: 'refused', reason: 'guard-mismatch' };
    }

    const detail = await tx.readItemDetail(attempt.item, input.now, input.rules);

    invariant(detail !== null, `an attempt's item is stored: ${attempt.item}`);

    const item = detail.item;

    const settlement = pickSettlement({
      attempt,
      item,
      rules: input.rules,
      forced: input.forced,
      now: input.now,
    });

    const hasFileItem = settlement.effects.some((effect) => effect.kind === 'file-item');

    const settled = buildSettlePlans({
      effects: settlement.effects,
      ctx: {
        attempt,
        item,
        rules: input.rules,
        relations: detail.relations.filter((relation) => relation.source === item.id),
        actor: input.actor,
        now: input.now,
        newId: input.newId,
      },
      openIssues: hasFileItem ? await tx.listOpenIssues(item.repo, input.now, input.rules) : [],
      held: isHoldEdge(input.rules, item, attempt, settlement.outcome),
    });

    const built = buildAttemptChange({
      attempt,
      event: {
        kind: 'settled',
        state: settlement.state,
        failure: settlement.failure,
        outcome: settlement.outcome,
        returnedOutcome: settlement.returnedOutcome,
        sessionStopped: input.sessionStopped,
        frictionDropped: settlement.frictionDropped,
        criteria: settled.criteria,
        matched: settled.matched,
        skippedEffects: settled.skippedEffects,
      },
      actor: input.actor,
      now: input.now,
      newId: input.newId,
    });

    if (built.kind === 'not-allowed') {
      return { kind: 'not-allowed' };
    }

    const change: StoreChange = {
      ...built.change,
      writes: [
        ...built.change.writes,
        ...(settlement.state === 'succeeded' && input.sessionStopped
          ? buildKeepWrites({ attempt, item, rules: input.rules, now: input.now })
          : []),
        ...settled.plans.flatMap((plan) => (plan.kind === 'apply' ? plan.writes : [])),
      ],
      facts: [
        ...built.change.facts,
        ...settled.plans.flatMap((plan) => (plan.kind === 'apply' ? plan.facts : [])),
      ],
    };

    const result = await tx.applyChange(change);

    if (result.kind !== 'applied') {
      return { kind: 'refused', reason: result.kind };
    }

    await writeHoldNotice(tx, attempt, input.rules, input.now);

    return result;
  });
}

// The one place where settle reads an edge; it stores no position.
function isHoldEdge(
  rules: LoadedRules,
  item: ItemView,
  attempt: AttemptRow,
  outcome: OutcomeName | EngineOutcome,
): boolean {
  const step = rules.kinds
    .get(item.kind)
    ?.pipeline.steps.find((candidate) => candidate.phase === attempt.phase);

  const edge = step?.on[outcome];

  return typeof edge === 'object' && 'hold' in edge;
}

async function writeHoldNotice(
  tx: StoreTx,
  attempt: AttemptRow,
  rules: LoadedRules,
  now: Instant,
): Promise<void> {
  const after = await tx.readItem(attempt.item, now, rules);

  if (after?.position.kind !== 'hold') {
    return;
  }

  // the store numbers each notice, so the ID here is replaced
  await tx.applyChange({
    at: now,
    writes: [
      {
        op: 'insert',
        table: 'notices',
        row: {
          id: 1,
          item: attempt.item,
          reason: after.position.reason,
          at: now,
          tries: 0,
          sentAt: null,
        },
      },
    ],
    facts: [],
  });
}
