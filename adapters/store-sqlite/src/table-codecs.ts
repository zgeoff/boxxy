import type { TableName, Tables } from '@boxxy/model';

interface TableCodec<Row> {
  // every field of the row; the column is the field's name in snake case
  readonly fields: readonly (keyof Row & string)[];

  // the fields stored as JSON text
  readonly json: readonly (keyof Row & string)[];

  // the boolean fields, stored as 0 or 1
  readonly flags: readonly (keyof Row & string)[];
}

export const tableCodecs: { readonly [T in TableName]: TableCodec<Tables[T]> } = {
  items: {
    fields: [
      'id',
      'kind',
      'repo',
      'title',
      'outcome',
      'acceptance',
      'foundInAttempt',
      'filedBy',
      'filedAt',
      'closedAt',
      'closeReason',
    ],
    json: ['acceptance'],
    flags: [],
  },
  links: {
    fields: ['source', 'target', 'type', 'addedBy', 'addedAt', 'removedAt'],
    json: [],
    flags: [],
  },
  levers: {
    fields: ['seq', 'kind', 'item', 'until', 'expiresAt', 'reason', 'actor', 'at'],
    json: [],
    flags: [],
  },
  attempts: {
    fields: [
      'id',
      'item',
      'phase',
      'number',
      'runner',
      'recipeHash',
      'rulesVersion',
      'pool',
      'slot',
      'slotGen',
      'leaseGen',
      'spawnRequest',
      'spawnRequestHash',
      'state',
      'failure',
      'atcSession',
      'closeOut',
      'claimedAt',
      'startedAt',
      'endedAt',
    ],
    json: ['spawnRequest', 'closeOut'],
    flags: [],
  },
  attempt_sessions: {
    fields: ['attempt', 'agentSession', 'atcSession', 'seenAt'],
    json: [],
    flags: [],
  },
  leases: {
    fields: ['item', 'phase', 'attempt', 'gen', 'takenAt', 'releasedAt'],
    json: [],
    flags: [],
  },
  pool_slots: {
    fields: ['pool', 'slot', 'holder', 'gen', 'retired'],
    json: [],
    flags: ['retired'],
  },
  decisions: {
    fields: [
      'id',
      'attempt',
      'item',
      'pool',
      'rulesVersion',
      'snapshotHash',
      'storeVersion',
      'pepysOffsets',
      'faults',
      'at',
    ],
    json: ['pepysOffsets', 'faults'],
    flags: [],
  },
  evidence: {
    fields: ['factId', 'attempt', 'kind', 'ref', 'observed', 'source', 'at'],
    json: [],
    flags: [],
  },
  pull_requests: {
    fields: ['repo', 'number', 'attempt', 'state', 'mergedAt', 'mergeCommit', 'checkedAt'],
    json: [],
    flags: [],
  },
  runners: {
    fields: ['id', 'heartbeatAt', 'paused'],
    json: [],
    flags: ['paused'],
  },
};
