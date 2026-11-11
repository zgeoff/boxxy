import { expect, test } from 'bun:test';
import { closeOutLimits } from '@boxxy/closeout';
import { outboxLimits } from './constants.ts';

test('it keeps a close-out escaped once more, with its fact wrapper, under the fact limit', () => {
  expect(2 * closeOutLimits.closeOutBytes + 1024).toBeLessThan(outboxLimits.factBytes);
});

test('it leaves room for one fact of the fact limit inside the byte budget of a batch', () => {
  expect(outboxLimits.factBytes + outboxLimits.envelopeBytes + 8).toBeLessThan(
    outboxLimits.batchBytes,
  );
});

test('it holds the fact limit at 256 KiB, the number the close-out limit test writes', () => {
  const factBytes: number = outboxLimits.factBytes;

  expect(factBytes).toBe(256 * 1024);
});

test('it leaves most of the envelope allowance for the version and api fields after the prefixed fact ID', () => {
  const id = 'event:boxxy:0190a6f4-0000-7000-8000-000000000001';

  const idBytes = new TextEncoder().encode(`,${JSON.stringify({ id }).slice(1, -1)}`).length;

  expect(outboxLimits.envelopeBytes - idBytes).toBeGreaterThan(400);
});
