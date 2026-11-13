import { expect, test } from 'bun:test';
import { designCloseOutSchema } from './design-close-out-schema.ts';

test('it accepts a designed close-out with the whole design text and its location', () => {
  const closeOut = {
    result: {
      kind: 'designed',
      design: {
        text: '## Plan\n\n```ts\nexport const retry = 1;\n```',
        location: 'docs/design/retry.md',
      },
    },
    friction: [{ target: { kind: 'skill', name: 'docs-writing' }, change: 'Name the doc type' }],
    frictionDropped: 0,
  };

  const parsed: unknown = designCloseOutSchema.safeParse(closeOut).data;

  expect(parsed).toStrictEqual(closeOut);
});

test('it reads a stored design close-out that holds a summary as the design text', () => {
  const stored = {
    result: {
      kind: 'designed',
      design: { summary: 'One retry button per upload row', location: 'docs/design/retry.md' },
    },
    friction: [],
    frictionDropped: 0,
  };

  const parsed: unknown = designCloseOutSchema.safeParse(stored).data;

  expect(parsed).toStrictEqual({
    ...stored,
    result: {
      kind: 'designed',
      design: { text: 'One retry button per upload row', location: 'docs/design/retry.md' },
    },
  });
});

test('it accepts a designed close-out with a conclusion beside the design', () => {
  const closeOut = {
    result: {
      kind: 'designed',
      design: { text: 'Read the upload logs of one week.', location: null },
      conclusion: 'The retries come from the proxy timeout of 30 seconds.',
    },
    friction: [],
    frictionDropped: 0,
  };

  const parsed: unknown = designCloseOutSchema.safeParse(closeOut).data;

  expect(parsed).toStrictEqual(closeOut);
});

test('it rejects a designed close-out with an empty conclusion', () => {
  const closeOut = {
    result: {
      kind: 'designed',
      design: { text: 'Read the upload logs of one week.', location: null },
      conclusion: '',
    },
    friction: [],
    frictionDropped: 0,
  };

  expect(designCloseOutSchema.safeParse(closeOut).error?.issues).toPartiallyContain({
    path: ['result', 'conclusion'],
  });
});

test('it rejects a designed close-out with an empty design text', () => {
  const closeOut = {
    result: { kind: 'designed', design: { text: '', location: null } },
    friction: [],
    frictionDropped: 0,
  };

  expect(designCloseOutSchema.safeParse(closeOut).error?.issues).toPartiallyContain({
    path: ['result', 'design', 'text'],
  });
});

test('it accepts a designed close-out that sets the acceptance list and files open items', () => {
  const closeOut = {
    result: {
      kind: 'designed',
      design: { text: '## Plan\n\nOne retry per upload row.', location: null },
      set: { acceptance: [{ text: 'A failed upload retries once' }] },
      openItems: [{ kind: 'core.issue', title: 'Cap the retry queue', body: 'Found in design.' }],
    },
    friction: [],
    frictionDropped: 0,
  };

  const parsed: unknown = designCloseOutSchema.safeParse(closeOut).data;

  expect(parsed).toStrictEqual(closeOut);
});

test('it rejects a designed close-out that sets a criterion with empty text', () => {
  const closeOut = {
    result: {
      kind: 'designed',
      design: { text: 'One retry per upload row.', location: null },
      set: { acceptance: [{ text: '' }] },
    },
    friction: [],
    frictionDropped: 0,
  };

  expect(designCloseOutSchema.safeParse(closeOut).error?.issues).toPartiallyContain({
    path: ['result', 'set', 'acceptance', 0, 'text'],
  });
});

test('it rejects a blocked close-out that files open items', () => {
  const closeOut = {
    result: {
      kind: 'blocked',
      reason: 'Should a retry keep the old upload id?',
      openItems: [{ kind: 'core.issue', title: 'Cap the retry queue', body: '' }],
    },
    friction: [],
    frictionDropped: 0,
  };

  expect(designCloseOutSchema.safeParse(closeOut).error?.issues).toPartiallyContain({
    code: 'unrecognized_keys',
    path: ['result'],
  });
});
