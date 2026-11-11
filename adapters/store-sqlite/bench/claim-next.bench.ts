import { defineBench } from '@zgeoff/rig/bench';
import { createClaimBench } from '../src/test-utils/create-claim-bench.ts';

// The claim's lock limit is p99 under 50 ms at 5,000 open items (docs/design/boxxy/slice-1.md);
// rig judges the median only.
export default defineBench({
  name: 'claim at 5,000 open items',
  budget: '50ms',
  setup: () => createClaimBench({ itemCount: 5000 }),
  run: async (bench) => {
    await bench.claim();
  },
});
