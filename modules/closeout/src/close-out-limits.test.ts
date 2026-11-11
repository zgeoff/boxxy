import { expect, test } from 'bun:test';
import { closeOutLimits } from './close-out-limits.ts';

test('it keeps a close-out escaped once more, with its fact wrapper, under a fact of 256 KiB', () => {
  const factBytes = 262_144;

  expect(2 * closeOutLimits.closeOutBytes + 1024).toBeLessThan(factBytes);
});

test('it keeps a whole noslop report inside the limit of a close-out', () => {
  expect(closeOutLimits.noslopReportBytes).toBeLessThan(closeOutLimits.closeOutBytes);
});
