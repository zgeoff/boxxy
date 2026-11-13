import { expect, test } from 'bun:test';
import { buildMockV1LeverRow } from '../test-utils/build-mock-v1-lever-row.ts';
import { findHeldReason } from './find-held-reason.ts';

test('it finds the reason of a held lever with no release after it', () => {
  const held = buildMockV1LeverRow({ seq: 1, kind: 'item.held', reason: 'a draft to finish' });

  expect(findHeldReason([held])).toBe('a draft to finish');
});

test('it finds no reason when a release follows the held lever', () => {
  const held = buildMockV1LeverRow({ seq: 1, kind: 'item.held', reason: 'a draft to finish' });
  const release = buildMockV1LeverRow({ seq: 2, kind: 'item.release', reason: null });

  expect(findHeldReason([held, release])).toBeNull();
});

test('it finds the reason of a held lever that comes after a release', () => {
  const release = buildMockV1LeverRow({ seq: 1, kind: 'item.release', reason: null });
  const held = buildMockV1LeverRow({ seq: 2, kind: 'item.held', reason: 'held again' });

  expect(findHeldReason([held, release])).toBe('held again');
});

test('it finds no reason for an item whose levers hold no held lever', () => {
  const retry = buildMockV1LeverRow({ seq: 1, kind: 'item.retry', reason: null });

  expect(findHeldReason([retry])).toBeNull();
});
