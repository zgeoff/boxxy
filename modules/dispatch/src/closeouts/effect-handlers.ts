import type {
  AnyNewFact,
  ItemId,
  ItemRow,
  RelationRow,
  RelationTypeName,
  RowWrite,
} from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import type { EffectContext, EffectHandlers, EffectPlan } from './types.ts';

// The plan of each kind of effect. Pure: each handler reads only its context, and refuses with
// `skip` rather than throw, so a settle never fails on stored data.
export const effectHandlers: EffectHandlers = {
  'file-item': (effect, ctx) => {
    const kind = brandSchemas.itemKindName.parse(effect.item.kind);

    if (!ctx.rules.kinds.has(kind)) {
      return { kind: 'skip', effect, reason: `the rules have no kind ${kind}` };
    }

    const row: ItemRow = {
      id: brandSchemas.itemId.parse(ctx.newId()),
      kind,
      repo: ctx.item.repo,
      title: effect.item.title,
      outcome: effect.item.body,
      body: '',
      acceptance: [],
      fields: {},
      labels: [],
      foundInAttempt: ctx.attempt.id,
      filedBy: ctx.actor,
      filedAt: ctx.now,
      closedAt: null,
      closeReason: null,
      keptSession: null,
    };

    const { keptSession: _keptSession, ...filed } = row;

    return {
      kind: 'apply',
      effect,
      writes: [{ op: 'insert', table: 'items', row }],
      facts: [buildItemFact(ctx, row.id, { type: 'boxxy.item.filed', payload: filed })],
    };
  },
  'close-item': (effect, ctx) => {
    const closed = findClosedReason(ctx);

    if (closed !== null) {
      return { kind: 'skip', effect, reason: closed };
    }

    // a relation that is live already, such as one an earlier effect adds, is not added again
    const relation = effect.of === null ? null : buildRelationPlan(ctx, 'duplicate-of', effect.of);
    const duplicateOf = typeof relation === 'string' ? null : relation;

    return {
      kind: 'apply',
      effect,
      writes: [
        ...(duplicateOf?.writes ?? []),
        buildItemUpdate(ctx, { closedAt: ctx.now, closeReason: effect.reason }),
      ],
      facts: [
        ...(duplicateOf?.facts ?? []),
        buildItemFact(ctx, ctx.item.id, {
          type: 'boxxy.item.closed',
          payload: { reason: effect.reason, byAttempt: ctx.attempt.id, ended: [] },
        }),
      ],
    };
  },
  'add-relation': (effect, ctx) => {
    const closed = findClosedReason(ctx);

    if (closed !== null) {
      return { kind: 'skip', effect, reason: closed };
    }

    const plan = buildRelationPlan(ctx, effect.relation.type, effect.relation.target);

    return typeof plan === 'string'
      ? { kind: 'skip', effect, reason: plan }
      : { kind: 'apply', effect, ...plan };
  },
  'set-kind': (effect, ctx) => {
    const closed = findClosedReason(ctx);

    if (closed !== null) {
      return { kind: 'skip', effect, reason: closed };
    }

    if (!ctx.rules.kinds.has(effect.itemKind)) {
      return { kind: 'skip', effect, reason: `the rules have no kind ${effect.itemKind}` };
    }

    return buildEditPlan(effect, ctx, { kind: effect.itemKind });
  },
  'set-field': (effect, ctx) => {
    const closed = findClosedReason(ctx);

    if (closed !== null) {
      return { kind: 'skip', effect, reason: closed };
    }

    return buildEditPlan(effect, ctx, {
      fields: { ...ctx.item.fields, [effect.field]: effect.value },
    });
  },
  'set-acceptance': (effect, ctx) => {
    const closed = findClosedReason(ctx);

    if (closed !== null) {
      return { kind: 'skip', effect, reason: closed };
    }

    return buildEditPlan(effect, ctx, { acceptance: effect.criteria });
  },
  'set-body': (effect, ctx) => {
    const closed = findClosedReason(ctx);

    if (closed !== null) {
      return { kind: 'skip', effect, reason: closed };
    }

    return buildEditPlan(effect, ctx, { body: effect.body });
  },

  // a fact about the attempt only, so it records on a closed item too
  'record-proposal': (effect, ctx) => ({
    kind: 'apply',
    effect,
    writes: [],
    facts: [
      buildItemFact(ctx, ctx.item.id, {
        type: 'boxxy.proposal.recorded',
        payload: { attempt: ctx.attempt.id, ...effect.friction },
      }),
    ],
  }),
};

type FactBody = {
  [T in AnyNewFact['type']]: Pick<Extract<AnyNewFact, { type: T }>, 'type' | 'payload'>;
}[AnyNewFact['type']];

function buildItemFact(ctx: EffectContext, item: ItemId, body: FactBody): AnyNewFact {
  const fact: AnyNewFact = {
    ...body,
    id: brandSchemas.factId.parse(ctx.newId()),
    entity: `boxxy:item:${item}`,
    actor: ctx.actor,
  };

  return fact;
}

function findClosedReason(ctx: EffectContext): string | null {
  return ctx.item.closedAt === null ? null : 'the item is closed';
}

function buildRelationPlan(
  ctx: EffectContext,
  typeName: string,
  target: ItemId,
): Pick<Extract<EffectPlan, { kind: 'apply' }>, 'writes' | 'facts'> | string {
  const type = ctx.rules.relationTypes.get(brandSchemas.relationTypeName.parse(typeName))?.name;

  if (type === undefined) {
    return `the rules have no relation type ${typeName}`;
  }

  if (target === ctx.item.id) {
    return 'an item has no relation to itself';
  }

  if (isLive(ctx.relations, target, type)) {
    return 'the relation is live already';
  }

  const row: RelationRow = {
    source: ctx.item.id,
    target,
    type,
    addedBy: ctx.actor,
    addedAt: ctx.now,
    removedAt: null,
  };

  return {
    writes: [{ op: 'insert', table: 'relations', row }],
    facts: [
      buildItemFact(ctx, ctx.item.id, {
        type: 'boxxy.relation.added',
        payload: { source: row.source, target, type },
      }),
    ],
  };
}

function isLive(
  relations: readonly RelationRow[],
  target: ItemId,
  type: RelationTypeName,
): boolean {
  return relations.some(
    (relation) =>
      relation.target === target && relation.type === type && relation.removedAt === null,
  );
}

// Every update of the item expects it open, so a close of the same change goes last.
function buildItemUpdate(ctx: EffectContext, set: Partial<ItemRow>): RowWrite {
  return {
    op: 'update',
    table: 'items',
    key: { id: ctx.item.id },
    expect: { closedAt: null },
    set,
  };
}

function buildEditPlan(
  effect: Extract<EffectPlan, { kind: 'apply' }>['effect'],
  ctx: EffectContext,
  set: Pick<Partial<ItemRow>, 'kind' | 'fields' | 'acceptance' | 'body'>,
): EffectPlan {
  return {
    kind: 'apply',
    effect,
    writes: [buildItemUpdate(ctx, set)],
    facts: [
      buildItemFact(ctx, ctx.item.id, {
        type: 'boxxy.item.edited',
        payload: { ...set, byAttempt: ctx.attempt.id },
      }),
    ],
  };
}
