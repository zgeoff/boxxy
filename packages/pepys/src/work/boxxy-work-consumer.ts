import { defineConsumer, defineTable } from '@pepys/kit';
import { workFamily } from '../boxxy-source.ts';
import { attemptOf, produced, ranIn } from './constants.ts';

// One scope per item: a fact on the stream marks its item dirty, and the entry file gets every
// fact of the item and returns every row and link the item owns.
export const boxxyWorkConsumer = defineConsumer({
  name: 'boxxy_work',
  entry: new URL('../consumers/apply-scope.ts', import.meta.url),
  input: { mode: 'scope', scopeKind: 'boxxy:item', streams: [workFamily.stream] },
  tables: {
    boxxy_item: defineTable({
      columns: {
        id: { kind: 'entityID' },
        kind: { kind: 'text' },
        repo: { kind: 'text' },
        title: { kind: 'text' },
        design_mode: { kind: 'text', nullable: true },
        filed_at: { kind: 'timestamp' },
        closed_at: { kind: 'timestamp', nullable: true },
        close_reason: { kind: 'text', nullable: true },
        updated_at: { kind: 'timestamp' },
      },
      primaryKey: ['id'],
      indexes: [],
    }),
    boxxy_attempt: defineTable({
      columns: {
        id: { kind: 'entityID' },
        item_id: { kind: 'entityID' },
        phase: { kind: 'text' },
        number: { kind: 'integer' },
        round: { kind: 'integer' },
        mode: { kind: 'text' },
        pool: { kind: 'text' },
        recipe_hash: { kind: 'text' },
        rules_version: { kind: 'text' },
        atc_session: { kind: 'text', nullable: true },
        state: { kind: 'text' },
        outcome: { kind: 'text', nullable: true },
        failure: { kind: 'text', nullable: true },
        claimed_at: { kind: 'timestamp' },
        started_at: { kind: 'timestamp', nullable: true },
        closed_out_at: { kind: 'timestamp', nullable: true },
        ended_at: { kind: 'timestamp', nullable: true },

        // a review's count of changed lines outside the files of the earlier review's findings
        unrelated_lines: { kind: 'integer', nullable: true },

        // the stretches of sleep, `{ from, to }` with `to` null while asleep: the entry file does
        // no date arithmetic, so the queries add them up
        sleeps: { kind: 'json' },
        updated_at: { kind: 'timestamp' },
      },
      primaryKey: ['id'],
      indexes: [{ columns: ['item_id'] }],
    }),

    // The join table of the cost query: one row per attempt and telemetry session. `key` `atc`
    // holds the atc session, and `agent` the agent's own session, which matches only a telemetry
    // row that carried no atc session ID.
    boxxy_attempt_session: defineTable({
      columns: {
        attempt_id: { kind: 'entityID' },
        session_id: { kind: 'entityID' },
        key: { kind: 'text' },
        product: { kind: 'text', nullable: true },
        caller_issuer: { kind: 'text', nullable: true },
        caller_subject: { kind: 'text', nullable: true },
        bound_at: { kind: 'timestamp' },
      },
      primaryKey: ['attempt_id', 'session_id'],
      indexes: [{ columns: ['session_id'] }],
    }),
  },
  entityViews: [
    {
      table: 'boxxy_item',
      kind: 'boxxy:item',
      id: 'id',
      title: 'title',
      url: null,
      actor: null,
      updatedAt: 'updated_at',
    },
    {
      table: 'boxxy_attempt',
      kind: 'boxxy:attempt',
      id: 'id',
      title: 'phase',
      url: null,
      actor: null,
      updatedAt: 'updated_at',
    },
  ],
  reads: [],
  links: [ranIn, produced, attemptOf],
});
