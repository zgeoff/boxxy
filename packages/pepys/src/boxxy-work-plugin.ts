import { definePlugin } from '@pepys/kit';
import { boxxySource } from './boxxy-source.ts';
import { boxxyWorkConsumer } from './work/boxxy-work-consumer.ts';

// The source and the consumer without the queries, which need the GitHub and telemetry consumers.
// `pepys build` writes the consumer's glue from this plug-in.
export const boxxyWorkPlugin = definePlugin({
  name: 'boxxy',
  sources: [boxxySource],
  consumers: [boxxyWorkConsumer],
});
