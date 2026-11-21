import { afterEach } from 'bun:test';
import { createTestNetwork } from '@zgeoff/testing/fetch';
import { githubHandlers, resetGithub } from './github-handlers.ts';

// The one mock network of a test process. The root test preload lists this file, so every test
// file gets it. A request to a host that no handler matches fails the test, and a loopback
// request, such as one to a server that a test starts, goes through to it.
export const mockNetwork = createTestNetwork({ handlers: [...githubHandlers] });

afterEach(() => {
  resetGithub();
});
