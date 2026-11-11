import { expect, onTestFinished, test } from 'bun:test';
import { createClaimBench } from './create-claim-bench.ts';

test('it claims a different open item on each of 30 claims in a row', async () => {
  const bench = await createClaimBench({ itemCount: 30 });

  onTestFinished(() => bench[Symbol.asyncDispose]());

  const items = new Set();

  for (let index = 0; index < 30; index += 1) {
    const item = await bench.claim();

    items.add(item);
  }

  expect(items.size).toBe(30);
});

test('it throws when no open item is left to claim', async () => {
  const bench = await createClaimBench({ itemCount: 1 });

  onTestFinished(() => bench[Symbol.asyncDispose]());

  await bench.claim();

  expect(bench.claim()).rejects.toThrowWithMessage(Error, /picked no item/u);
});
