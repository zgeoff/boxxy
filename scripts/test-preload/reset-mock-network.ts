import { afterAll, afterEach, beforeAll } from 'bun:test';
import { resetGithub } from '../../adapters/forge-github/src/test-utils/github-handlers.ts';
import { mockNetwork } from './mock-network.ts';

beforeAll(() => {
  mockNetwork.enable();
});

afterEach(() => {
  mockNetwork.resetHandlers();

  resetGithub();
});

afterAll(() => {
  mockNetwork.disable();
});
