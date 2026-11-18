import { expect, test } from 'bun:test';
import type { CommitSha, ItemShipped, RepoPolicy, WaitSubject } from '@boxxy/model';
import { brandSchemas } from '@boxxy/model';
import { buildMockV1ItemRow } from '@boxxy/model/test-utils/build-mock-v1-item-row';
import { createShippedWaitKind } from './create-shipped-wait-kind.ts';

function setupTest() {
  const item = buildMockV1ItemRow();
  const commit = brandSchemas.commitSha.parse('a1'.repeat(20));
  const other = brandSchemas.commitSha.parse('b2'.repeat(20));
  const ships: RepoPolicy = { ships: { release: {} } };
  const none: RepoPolicy = { ships: 'none' };

  const buildShipped = (shippedCommit: CommitSha): ItemShipped => ({
    itemId: item.id,
    commit: shippedCommit,
    rule: 'release',
    ref: 'v1.0.0',
    seenAt: brandSchemas.instant.parse(1000),
  });

  const buildSubject = (mergeCommit: CommitSha | null, shipped: readonly ItemShipped[]) => {
    const subject: WaitSubject = { item, mergeCommit, shipped };

    return subject;
  };

  return {
    kind: createShippedWaitKind(brandSchemas.workerKindName.parse('merge.forge')),
    commit,
    other,
    ships,
    none,
    buildShipped,
    buildSubject,
  };
}

test('it holds when a shipped row names the merge commit', () => {
  const ctx = setupTest();
  const subject = ctx.buildSubject(ctx.commit, [ctx.buildShipped(ctx.commit)]);

  expect(ctx.kind.read(subject, ctx.ships)).toBe('holds');
});

test('it holds when a shipped row names the merge commit, whatever the repo ships now', () => {
  const ctx = setupTest();
  const subject = ctx.buildSubject(ctx.commit, [ctx.buildShipped(ctx.commit)]);

  expect(ctx.kind.read(subject, ctx.none)).toBe('holds');
});

test('it waits when the only shipped row names another commit', () => {
  const ctx = setupTest();
  const subject = ctx.buildSubject(ctx.commit, [ctx.buildShipped(ctx.other)]);

  expect(ctx.kind.read(subject, ctx.ships)).toBe('waiting');
});

test('it waits for an item with no merge commit in a repo that ships', () => {
  const ctx = setupTest();

  expect(ctx.kind.read(ctx.buildSubject(null, []), ctx.ships)).toBe('waiting');
});

test('it skips for a repo that ships nothing, with no shipped row', () => {
  const ctx = setupTest();
  const subject = ctx.buildSubject(ctx.commit, []);

  expect(ctx.kind.read(subject, ctx.none)).toBe('skip');
});

test('it comes after the merged outcome and names the worker it was given', () => {
  const ctx = setupTest();

  expect([ctx.kind.name, ctx.kind.after, ctx.kind.worker]).toStrictEqual([
    'shipped',
    { outcome: 'merged' },
    'merge.forge',
  ]);
});
