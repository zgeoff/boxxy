import type { DesignMode, Instant, ItemRow, NewId, PhaseName, StoreChange } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';

export interface SeedItemInput {
  // the phase the item stands at, through an `item.retry --phase` lever; with none, the item
  // stands at its pipeline's first phase and has no lever
  readonly phase?: PhaseName;
  readonly designMode?: DesignMode;
}

// The filing of a dark-theme issue in the example repo, with its file fact, and the lever and its
// fact when the input names a phase.
export function buildSeedItemChange(
  newId: NewId,
  now: Instant,
  input: SeedItemInput,
): { readonly row: ItemRow; readonly change: StoreChange } {
  const row = buildSeedItemRow(newId, now, input);
  const { keptSession: _keptSession, ...filed } = row;

  const fileFact = {
    id: brandSchemas.factId.parse(newId()),
    type: 'boxxy.item.filed',
    entity: `boxxy:item:${row.id}`,
    actor: 'boxxy:owner:local',
    payload: filed,
  } as const;

  if (input.phase === undefined) {
    return {
      row,
      change: { at: now, writes: [{ op: 'insert', table: 'items', row }], facts: [fileFact] },
    };
  }

  const lever = {
    seq: 1,
    kind: 'item.retry',
    item: row.id,
    until: null,
    expiresAt: null,
    reason: null,
    phase: input.phase,
    actor: 'boxxy:owner:local',
    at: now,
  } as const;

  return {
    row,
    change: {
      at: now,
      writes: [
        { op: 'insert', table: 'items', row },
        { op: 'insert', table: 'levers', row: lever },
      ],
      facts: [
        fileFact,
        {
          id: brandSchemas.factId.parse(newId()),
          type: 'boxxy.lever.recorded',
          entity: `boxxy:item:${row.id}`,
          actor: 'boxxy:owner:local',
          payload: lever,
        },
      ],
    },
  };
}

function buildSeedItemRow(newId: NewId, now: Instant, input: SeedItemInput): ItemRow {
  return {
    id: brandSchemas.itemId.parse(newId()),
    kind: brandSchemas.itemKindName.parse('core.issue'),
    repo: brandSchemas.repoName.parse('example/app'),
    title: 'Add a dark theme',
    outcome: 'The app follows the system theme.',
    body: '',
    acceptance: [
      {
        id: brandSchemas.criterionId.parse('a1'),
        text: 'The app reads dark when the system does.',
        evidence: [],
      },
    ],
    fields: input.designMode === undefined ? {} : { designMode: input.designMode },
    labels: [],
    foundInAttempt: null,
    filedBy: 'boxxy:owner:local',
    filedAt: now,
    closedAt: null,
    closeReason: null,
    keptSession: null,
  };
}
