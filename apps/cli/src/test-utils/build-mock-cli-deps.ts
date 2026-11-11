import type { CLIDeps } from '../types.ts';

// Deps that read an empty stdin and file, run no git and sleep at once. A test that sends a request
// adds `send`, the fake `fetch`.
export function buildMockCLIDeps(env: CLIDeps['env']): CLIDeps {
  return {
    env,
    readStdin: () => Promise.resolve(''),
    readFile: () => Promise.resolve(''),
    runGit: () => Promise.resolve({ exitCode: 0, output: '' }),
    sleep: () => Promise.resolve(),
    now: () => 0,
  };
}
