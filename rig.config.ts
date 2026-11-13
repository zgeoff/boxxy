import { defineRig } from '@zgeoff/rig';

export default defineRig({
  lanes: {
    // The tests in apps/cli/e2e and apps/server/e2e. They run the CLI and the server in the test
    // process, so they need no program; one end-to-end journey runs for many seconds.
    system: { suffix: '.system', limit: '30s' },
  },
});
