import { dedupeOpenItems } from '@boxxy/closeout';
import type { Effect, ItemId, ItemView, OpenItem, WorkFacts } from '@boxxy/model';
import { match } from 'ts-pattern';
import { effectHandlers } from './effect-handlers.ts';
import type { EffectContext, EffectPlan } from './types.ts';

type SettledFact = WorkFacts['boxxy.attempt.settled'];

interface SettlePlansInput {
  readonly effects: readonly Effect[];
  readonly ctx: EffectContext;

  // the open `core.issue` items of the item's repo, for the dedupe of filed items
  readonly openIssues: readonly ItemView[];

  // the rules map the outcome to a `{ hold: reason }` edge
  readonly held: boolean;
}

export interface SettlePlans {
  readonly plans: readonly EffectPlan[];
  readonly criteria: SettledFact['criteria'];
  readonly matched: readonly ItemId[];
  readonly skippedEffects: SettledFact['skippedEffects'];
}

// The plan of each effect of a settle, and the `settled` fact's fields that the plans decide.
// A hold withholds each effect that changes an existing item. Each plan sees what the plans
// before it write, so a repeated effect skips instead of breaking a key of the store.
export function buildSettlePlans(input: SettlePlansInput): SettlePlans {
  const fileItems = input.effects.flatMap((effect) =>
    effect.kind === 'file-item' ? [effect.item] : [],
  );

  // an item that this settle closes is no open issue a filed item can match
  const closes = !input.held && input.effects.some((effect) => effect.kind === 'close-item');

  const openIssues = closes
    ? input.openIssues.filter((issue) => issue.id !== input.ctx.item.id)
    : input.openIssues;

  const deduped = dedupeOpenItems(fileItems, openIssues);

  const toFile = new Set(deduped.file);

  // with no open issues to match, the dedupe keeps the first entry of each title
  const firsts = new Set(dedupeOpenItems(fileItems, []).file);
  const repeats = new Set(fileItems.filter((entry) => !firsts.has(entry)));

  const effects = input.effects
    .filter(
      (effect) =>
        effect.kind !== 'file-item' || toFile.has(effect.item) || repeats.has(effect.item),
    )

    // each item update expects the item open, so the close goes last
    .toSorted(
      (first, second) => Number(first.kind === 'close-item') - Number(second.kind === 'close-item'),
    );

  const plans = collectPlans(effects, input, repeats);

  return {
    plans,
    criteria: collectCopiedEvidence(plans, input.ctx.item),
    matched: deduped.matched,
    skippedEffects: plans.flatMap((plan) =>
      plan.kind === 'skip' ? [{ effect: plan.effect.kind, reason: plan.reason }] : [],
    ),
  };
}

function collectPlans(
  effects: readonly Effect[],
  input: SettlePlansInput,
  repeats: ReadonlySet<OpenItem>,
): EffectPlan[] {
  const plans: EffectPlan[] = [];
  let ctx = input.ctx;

  for (const effect of effects) {
    const reason = findSkipReason(effect, input.held, repeats);

    const plan: EffectPlan =
      reason === null ? planEffect(effect, ctx) : { kind: 'skip', effect, reason };

    plans.push(plan);

    ctx = buildPlannedContext(ctx, plan);
  }

  return plans;
}

function findSkipReason(
  effect: Effect,
  held: boolean,
  repeats: ReadonlySet<OpenItem>,
): string | null {
  if (effect.kind === 'file-item' && repeats.has(effect.item)) {
    return 'the close-out names this title already';
  }

  return held && isItemChange(effect) ? 'the item holds for the owner' : null;
}

const itemChanges: ReadonlySet<Effect['kind']> = new Set([
  'close-item',
  'add-relation',
  'set-kind',
  'set-field',
  'set-acceptance',
  'set-body',
]);

function isItemChange(effect: Effect): boolean {
  return itemChanges.has(effect.kind);
}

// A handler that throws is a bug in the handler, not in the stored data, but the settle still
// lands: the effect is skipped and listed.
function planEffect(effect: Effect, ctx: EffectContext): EffectPlan {
  try {
    return pickHandler(effect)(ctx);
  } catch (error) {
    return { kind: 'skip', effect, reason: `the handler failed: ${String(error)}` };
  }
}

function pickHandler(effect: Effect): (ctx: EffectContext) => EffectPlan {
  return match(effect)
    .returnType<(ctx: EffectContext) => EffectPlan>()
    .with({ kind: 'file-item' }, (filed) => (ctx) => effectHandlers['file-item'](filed, ctx))
    .with({ kind: 'close-item' }, (close) => (ctx) => effectHandlers['close-item'](close, ctx))
    .with({ kind: 'add-relation' }, (add) => (ctx) => effectHandlers['add-relation'](add, ctx))
    .with({ kind: 'set-kind' }, (set) => (ctx) => effectHandlers['set-kind'](set, ctx))
    .with({ kind: 'set-field' }, (set) => (ctx) => effectHandlers['set-field'](set, ctx))
    .with({ kind: 'set-acceptance' }, (set) => (ctx) => effectHandlers['set-acceptance'](set, ctx))
    .with({ kind: 'set-body' }, (set) => (ctx) => effectHandlers['set-body'](set, ctx))
    .with(
      { kind: 'record-proposal' },
      (record) => (ctx) => effectHandlers['record-proposal'](record, ctx),
    )
    .with(
      { kind: 'record-merge' },
      (record) => (ctx) => effectHandlers['record-merge'](record, ctx),
    )
    .exhaustive();
}

// The context as the store will hold it after the plan's writes.
function buildPlannedContext(ctx: EffectContext, plan: EffectPlan): EffectContext {
  if (plan.kind === 'skip') {
    return ctx;
  }

  const added = plan.writes.flatMap((write) =>
    write.op === 'insert' && write.table === 'relations' ? [write.row] : [],
  );

  return {
    ...ctx,
    item: plan.effect.kind === 'close-item' ? { ...ctx.item, closedAt: ctx.now } : ctx.item,
    relations: [...ctx.relations, ...added],
    pullRequests: ctx.pullRequests.map((row) =>
      plan.effect.kind === 'record-merge' &&
      row.repo === plan.effect.pullRequest.repo &&
      row.number === plan.effect.pullRequest.number
        ? { ...row, state: 'merged' }
        : row,
    ),
  };
}

// The evidence ids that an applied `set-acceptance` added to each criterion.
function collectCopiedEvidence(
  plans: readonly EffectPlan[],
  item: ItemView,
): SettledFact['criteria'] {
  return plans.flatMap((plan) => {
    if (plan.kind !== 'apply' || plan.effect.kind !== 'set-acceptance') {
      return [];
    }

    return plan.effect.criteria.flatMap((criterion) => {
      const before = new Set(item.acceptance.find((old) => old.id === criterion.id)?.evidence);

      const added = criterion.evidence.filter((evidence) => !before.has(evidence));

      return added.length === 0 ? [] : [{ criterion: criterion.id, evidence: added }];
    });
  });
}
