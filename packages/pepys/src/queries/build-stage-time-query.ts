import { stageTimeSchema } from '@boxxy/model';
import { defineQuery } from '@pepys/kit';
import { z } from 'zod';
import { boxxyWorkConsumer } from '../work/boxxy-work-consumer.ts';
import { buildStageTime } from './build-stage-time.ts';
import { findItemEntityID } from './find-item-entity-id.ts';
import type { DeliveryReads, StageTimeReads } from './types.ts';

// The stage-time query: the item's attempts, and the delivery times of each pull request an
// attempt produced. Two statements, so an item with no pull request still has its phase times.
export function buildStageTimeQuery(delivery: DeliveryReads) {
  const reads: StageTimeReads = [boxxyWorkConsumer, ...delivery.consumers];

  return defineQuery({
    name: 'boxxy_stage_time',
    description:
      'Returns how long one boxxy item took in each of seven steps (triage, design, build, review, merge, release, deploy), its rework rounds and time, its wait for review and its sleep time. A step that has not happened has null minutes.',
    input: z.object({
      item: z.string().describe('The item, as `boxxy:item:<id>`'),
      environment: z.string().describe('The environment whose deploy counts, such as `production`'),
    }),
    output: stageTimeSchema,
    reads,
    handler: async (call) => {
      const item = findItemEntityID(call.input.item);
      const parts = { item: call.input.item, environment: call.input.environment };

      if (item === undefined) {
        return buildStageTime({ ...parts, attempts: [], deliveries: [] });
      }

      const attempts = await call.db
        .selectFrom('boxxy_attempt')
        .where('item_id', '=', item)
        .select([
          'id',
          'phase',
          'number',
          'round',
          'state',
          'outcome',
          'failure',
          'claimed_at',
          'ended_at',
          'sleeps',
        ])
        .orderBy('number')
        .orderBy('id')
        .execute();

      const deliveries = await delivery.readDeliveries(call.db, {
        item,
        environment: call.input.environment,
      });

      return buildStageTime({ ...parts, attempts, deliveries });
    },
  });
}
