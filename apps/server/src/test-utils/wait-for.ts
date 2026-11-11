import { setTimeout as sleep } from 'node:timers/promises';

// Polls the check until it is true. Throws when it is still false after `timeoutMs`.
export async function waitFor(check: () => boolean | Promise<boolean>, timeoutMs = 2000) {
  const deadline = performance.now() + timeoutMs;

  while (!(await check())) {
    if (performance.now() > deadline) {
      throw new Error(`the condition stayed false for ${timeoutMs} ms`);
    }

    await sleep(5);
  }
}
