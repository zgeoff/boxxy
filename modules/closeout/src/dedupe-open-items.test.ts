import { expect, test } from 'bun:test';
import { buildMockV1ItemView } from '@boxxy/model/test-utils/build-mock-v1-item-view';
import { dedupeOpenItems } from './dedupe-open-items.ts';

test('it matches an entry to an open item whose title is equal after normalising', () => {
  const open = buildMockV1ItemView({ title: 'Retry a failed download' });

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
  const open = buildMockV1ItemView({ title: 'Retry a failed upload' });

  const entries = [
    { kind: 'core.issue', title: 'Retry a failed download', body: 'Downloads fail too' },
  ] as const;

  expect(dedupeOpenItems(entries, [open])).toStrictEqual({
    file: [{ kind: 'core.issue', title: 'Retry a failed download', body: 'Downloads fail too' }],
    matched: [],
  });
});

test('it files the first of two entries whose titles are equal after normalising', () => {
  const entries = [
    { kind: 'core.issue', title: 'Show upload progress', body: 'Uploads look stuck' },
    { kind: 'core.issue', title: 'Retry a failed download', body: 'Downloads fail too' },
    { kind: 'core.issue', title: ' show  UPLOAD progress', body: 'Seen again on a big file' },
  ] as const;

  expect(dedupeOpenItems(entries, [])).toStrictEqual({
    file: [
      { kind: 'core.issue', title: 'Show upload progress', body: 'Uploads look stuck' },
      { kind: 'core.issue', title: 'Retry a failed download', body: 'Downloads fail too' },
    ],
    matched: [],
  });
});

test('it lists a matched item once when two entries match it', () => {
  const open = buildMockV1ItemView({ title: 'Retry a failed download' });

  const entries = [
    { kind: 'core.issue', title: 'Retry a failed download', body: 'Downloads fail too' },
    { kind: 'core.issue', title: 'retry a failed download', body: 'Seen again on retry' },
  ] as const;

  expect(dedupeOpenItems(entries, [open])).toStrictEqual({ file: [], matched: [open.id] });
});
