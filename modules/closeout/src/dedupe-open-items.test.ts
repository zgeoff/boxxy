import { expect, test } from 'bun:test';
import { brandSchemas } from '@boxxy/model';
import { buildMockV1ItemView } from '@boxxy/model/test-utils/build-mock-v1-item-view';
import { dedupeOpenItems } from './dedupe-open-items.ts';

test('it matches an entry to an open item whose title is equal after normalising', () => {
  const issue = brandSchemas.itemKindName.parse('core.issue');
  const open = buildMockV1ItemView({ title: 'Retry a failed download' });

  const entries = [
    { kind: issue, title: '  retry A   failed\tdownload ', body: 'Downloads fail too' },
    { kind: issue, title: 'Show upload progress', body: 'Uploads look stuck' },
  ];

  const deduped: unknown = dedupeOpenItems(entries, [open]);

  expect(deduped).toStrictEqual({
    file: [{ kind: 'core.issue', title: 'Show upload progress', body: 'Uploads look stuck' }],
    matched: [open.id],
  });
});

test('it files every entry when no open item matches', () => {
  const issue = brandSchemas.itemKindName.parse('core.issue');
  const open = buildMockV1ItemView({ title: 'Retry a failed upload' });
  const entries = [{ kind: issue, title: 'Retry a failed download', body: 'Downloads fail too' }];
  const deduped: unknown = dedupeOpenItems(entries, [open]);

  expect(deduped).toStrictEqual({
    file: [{ kind: 'core.issue', title: 'Retry a failed download', body: 'Downloads fail too' }],
    matched: [],
  });
});

test('it files the first of two entries whose titles are equal after normalising', () => {
  const issue = brandSchemas.itemKindName.parse('core.issue');

  const entries = [
    { kind: issue, title: 'Show upload progress', body: 'Uploads look stuck' },
    { kind: issue, title: 'Retry a failed download', body: 'Downloads fail too' },
    { kind: issue, title: ' show  UPLOAD progress', body: 'Seen again on a big file' },
  ];

  const deduped: unknown = dedupeOpenItems(entries, []);

  expect(deduped).toStrictEqual({
    file: [
      { kind: 'core.issue', title: 'Show upload progress', body: 'Uploads look stuck' },
      { kind: 'core.issue', title: 'Retry a failed download', body: 'Downloads fail too' },
    ],
    matched: [],
  });
});

test('it lists a matched item once when two entries match it', () => {
  const issue = brandSchemas.itemKindName.parse('core.issue');
  const open = buildMockV1ItemView({ title: 'Retry a failed download' });

  const entries = [
    { kind: issue, title: 'Retry a failed download', body: 'Downloads fail too' },
    { kind: issue, title: 'retry a failed download', body: 'Seen again on retry' },
  ];

  expect(dedupeOpenItems(entries, [open])).toStrictEqual({ file: [], matched: [open.id] });
});

test('it files an entry whose title matches an open item of another kind', () => {
  const bug = brandSchemas.itemKindName.parse('core.bug');
  const open = buildMockV1ItemView({ title: 'Retry a failed download' });
  const entries = [{ kind: bug, title: 'Retry a failed download', body: 'Downloads fail too' }];
  const deduped: unknown = dedupeOpenItems(entries, [open]);

  expect(deduped).toStrictEqual({
    file: [{ kind: 'core.bug', title: 'Retry a failed download', body: 'Downloads fail too' }],
    matched: [],
  });
});

test('it matches an entry to an open item of its own kind', () => {
  const bug = brandSchemas.itemKindName.parse('core.bug');
  const open = buildMockV1ItemView({ kind: bug, title: 'Retry a failed download' });
  const entries = [{ kind: bug, title: 'retry a failed download', body: 'Downloads fail too' }];

  expect(dedupeOpenItems(entries, [open])).toStrictEqual({ file: [], matched: [open.id] });
});

test('it files both of two entries whose titles are equal and whose kinds differ', () => {
  const issue = brandSchemas.itemKindName.parse('core.issue');
  const bug = brandSchemas.itemKindName.parse('core.bug');

  const entries = [
    { kind: issue, title: 'Escape the upload name', body: 'Found in review' },
    { kind: bug, title: 'Escape the upload name', body: 'Found in review' },
  ];

  const deduped: unknown = dedupeOpenItems(entries, []);

  expect(deduped).toStrictEqual({
    file: [
      { kind: 'core.issue', title: 'Escape the upload name', body: 'Found in review' },
      { kind: 'core.bug', title: 'Escape the upload name', body: 'Found in review' },
    ],
    matched: [],
  });
});
