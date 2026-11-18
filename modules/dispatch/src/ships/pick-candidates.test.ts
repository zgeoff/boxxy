import { expect, test } from 'bun:test';
import type { Instant, ItemId } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import invariant from 'tiny-invariant';
import { pickCandidates } from './pick-candidates.ts';
import type { ShipCandidate } from './types.ts';

function setupTest() {
  const repo = brandSchemas.repoName.parse('example/app');
  const commit = brandSchemas.commitSha.parse('a'.repeat(40));

  const candidates: ShipCandidate[] = Array.from({ length: 51 }, (_each, index) => ({
    itemId: brandSchemas.itemId.parse(
      `0190a6f4-0000-7000-8000-${index.toString().padStart(12, '0')}`,
    ),
    repo,
    commit,
    rule: { release: {} },
  }));

  const last = candidates.at(-1);

  invariant(last !== undefined, 'the candidates are not empty');

  return { candidates, last, lastChecked: new Map<ItemId, Instant>() };
}

test('it picks the first 50 candidates on a first pass', () => {
  const ctx = setupTest();
  const picked = pickCandidates(ctx.candidates, ctx.lastChecked, brandSchemas.instant.parse(10));

  expect(picked).toStrictEqual(ctx.candidates.slice(0, 50));
});

test('it reaches the 51st candidate on the next pass when the first 50 never ship', () => {
  const ctx = setupTest();

  pickCandidates(ctx.candidates, ctx.lastChecked, brandSchemas.instant.parse(10));

  const picked = pickCandidates(ctx.candidates, ctx.lastChecked, brandSchemas.instant.parse(20));

  expect(picked.map((candidate) => candidate.itemId)).toContain(ctx.last.itemId);
});

test('it forgets an item that is no longer a candidate', () => {
  const ctx = setupTest();

  pickCandidates(ctx.candidates, ctx.lastChecked, brandSchemas.instant.parse(10));
  pickCandidates(ctx.candidates.slice(0, 1), ctx.lastChecked, brandSchemas.instant.parse(20));

  expect([...ctx.lastChecked.keys()]).toStrictEqual(
    ctx.candidates.slice(0, 1).map((candidate) => candidate.itemId),
  );
});
