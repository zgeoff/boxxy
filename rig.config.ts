import { defineRig } from '@zgeoff/rig';

export default defineRig({
  lanes: {
    // The tests of two apps together, in system-tests/e2e. They run the CLI and the server in the
    // test process, so they need no program; one end-to-end journey runs for many seconds.
    system: { suffix: '.system', limit: '30s' },
  },
});
