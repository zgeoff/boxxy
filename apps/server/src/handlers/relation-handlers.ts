import type { ItemId, RelationRow, RelationTypeName } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { api } from './api.ts';
import { buildOwnerFact } from './build-owner-fact.ts';
import { readItemIds } from './read-item-ids.ts';

// The owner's relation commands. A refusal that the owner acts on is an answer, not an error.
export const relationHandlers = {
  add: api.relation.add.handler((options) => {
    const input = options.input;
    const notFound = options.errors.NOT_FOUND;
    const deps = options.context.deps;
    const rules = deps.rulesState().rules;

    return deps.store.exclusive(async (tx) => {
      const found = await readItemIds(tx, deps, [input.source, input.target]);

      if (found.kind === 'not-found') {
        throw notFound({ data: { item: found.item } });
      }

      const [source, target] = found.items;
      const type = brandSchemas.relationTypeName.safeParse(input.type);

      if (source === undefined || target === undefined) {
        throw notFound({ data: { item: input.source } });
      }

      if (!type.success || !rules.relationTypes.has(type.data)) {
        return { kind: 'refused', reason: 'unknown-type' } as const;
      }

      const now = deps.clock.now();

      const snapshot = await tx.readSnapshot(now, rules);

      const refusal = pickRelationRefusal(snapshot.relations, source, target, type.data);

      if (refusal !== null) {
        return { kind: 'refused', reason: refusal } as const;
      }

      const row: RelationRow = {
        source,
        target,
        type: type.data,
        addedBy: 'boxxy:owner:local',
        addedAt: now,
        removedAt: null,
      };

      await tx.applyChange({
        at: now,
        writes: [{ op: 'insert', table: 'relations', row }],
        facts: [
          buildOwnerFact(deps, source, 'boxxy.relation.added', { source, target, type: type.data }),
        ],
      });

      return { kind: 'added' } as const;
    });
  }),
  remove: api.relation.remove.handler((options) => {
    const input = options.input;
    const notFound = options.errors.NOT_FOUND;
    const deps = options.context.deps;

    return deps.store.exclusive(async (tx) => {
      const found = await readItemIds(tx, deps, [input.source, input.target]);

      if (found.kind === 'not-found') {
        throw notFound({ data: { item: found.item } });
      }

      const now = deps.clock.now();

      const snapshot = await tx.readSnapshot(now, deps.rulesState().rules);

      const live = snapshot.relations.find(
        (row) =>
          row.source === input.source && row.target === input.target && row.type === input.type,
      );

      if (live === undefined) {
        return { removed: false };
      }

      const key = { source: live.source, target: live.target, type: live.type };

      await tx.applyChange({
        at: now,
        writes: [
          {
            op: 'update',
            table: 'relations',
            key,
            expect: { removedAt: null },
            set: { removedAt: now },
          },
        ],
        facts: [buildOwnerFact(deps, live.source, 'boxxy.relation.removed', key)],
      });

      return { removed: true };
    });
  }),
};

// `exists`: the same live relation is there. `cycle`: the target already reaches the source
// through relations of the type, so the new one would close a loop.
function pickRelationRefusal(
  relations: readonly RelationRow[],
  source: ItemId,
  target: ItemId,
  type: RelationTypeName,
): 'exists' | 'cycle' | null {
  const ofType = relations.filter((row) => row.type === type);

  if (ofType.some((row) => row.source === source && row.target === target)) {
    return 'exists';
  }

  return isReachable(ofType, target, source) ? 'cycle' : null;
}

function isReachable(relations: readonly RelationRow[], from: ItemId, to: ItemId): boolean {
  const seen = new Set<ItemId>();

  const queue: ItemId[] = [from];

  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    if (next === to) {
      return true;
    }

    if (!seen.has(next)) {
      seen.add(next);
      queue.push(...relations.filter((row) => row.source === next).map((row) => row.target));
    }
  }

  return false;
}
