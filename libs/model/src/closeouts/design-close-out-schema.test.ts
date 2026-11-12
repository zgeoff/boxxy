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
