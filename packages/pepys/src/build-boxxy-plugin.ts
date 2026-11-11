import { definePlugin } from '@pepys/kit';
import { boxxySource } from './boxxy-source.ts';
import { buildCostToLandQuery } from './queries/build-cost-to-land-query.ts';
import { buildStageTimeQuery } from './queries/build-stage-time-query.ts';
import type { ForeignReads } from './queries/types.ts';
import { boxxyWorkConsumer } from './work/boxxy-work-consumer.ts';

// The boxxy plug-in of a pepys deployment: its source, its consumer and its two queries. The
// deployment passes the GitHub and telemetry consumers that the queries read, and deploys their
// plug-ins beside this one.
export function buildBoxxyPlugin(foreign: ForeignReads) {
  return definePlugin({
    name: 'boxxy',
    sources: [boxxySource],
    consumers: [boxxyWorkConsumer],
    queries: [buildCostToLandQuery(foreign), buildStageTimeQuery(foreign.delivery)],
  });
}
