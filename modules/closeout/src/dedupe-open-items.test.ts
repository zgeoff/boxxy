import { expect, test } from 'bun:test';
import { buildMockItemView } from '@boxxy/model/test-utils/build-mock-item-view';
import { dedupeOpenItems } from './dedupe-open-items.ts';

test('it matches an entry to an open item whose title is equal after normalising', () => {
  const open = buildMockItemView({ title: 'Retry a failed download' });

  const entries = [
    { kind: 'core.issue', title: '  retry A   failed\tdownload ', body: 'Downloads fail too' },
    { kind: 'core.issue', title: 'Show upload progress', body: 'Uploads look stuck' },
  ] as const;

  expect(dedupeOpenItems(entries, [open])).toStrictEqual({
    file: [{ kind: 'core.issue', title: 'Show upload progress', body: 'Uploads look stuck' }],
    matched: [open.id],
  });
});

test('it files every entry when no open item matches', () => {
  const open = buildMockItemView({ title: 'Retry a failed upload' });

  const entries = [
    { kind: 'core.issue', title: 'Retry a failed download', body: 'Downloads fail too' },
  ] as const;

  expect(dedupeOpenItems(entries, [open])).toStrictEqual({
    file: [{ kind: 'core.issue', title: 'Retry a failed download', body: 'Downloads fail too' }],
    matched: [],
  });
});

test('it lists a matched item once when two entries match it', () => {
  const open = buildMockItemView({ title: 'Retry a failed download' });

  const entries = [
    { kind: 'core.issue', title: 'Retry a failed download', body: 'Downloads fail too' },
    { kind: 'core.issue', title: 'retry a failed download', body: 'Seen again on retry' },
  ] as const;

  expect(dedupeOpenItems(entries, [open])).toStrictEqual({ file: [], matched: [open.id] });
});
